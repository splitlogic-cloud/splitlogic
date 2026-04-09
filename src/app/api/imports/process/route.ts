import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { finalizeImportRowsForJob } from "@/features/imports/imports.processor";

type ProcessBody = {
  importJobId?: string;
  import_id?: string;
  importId?: string;
  id?: string;
};

async function requireMembershipForCompany(companyId: string, authUserId: string) {
  const byUserId = await supabaseAdmin
    .from("company_memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", authUserId)
    .maybeSingle();

  if (!byUserId.error) {
    return byUserId.data;
  }

  const msg = String(byUserId.error.message || "");
  const looksLikeMissingColumn =
    msg.includes("Could not find the") ||
    msg.includes("schema cache") ||
    msg.includes("column");

  if (!looksLikeMissingColumn) {
    throw new Error(byUserId.error.message);
  }

  const byProfileId = await supabaseAdmin
    .from("company_memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("profile_id", authUserId)
    .maybeSingle();

  if (byProfileId.error) {
    throw new Error(byProfileId.error.message);
  }

  return byProfileId.data;
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();

    if (authErr || !auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as ProcessBody;

    const importJobId =
      body.importJobId ??
      body.importId ??
      body.import_id ??
      body.id ??
      null;

    if (!importJobId) {
      return NextResponse.json(
        { ok: false, error: "Missing importJobId" },
        { status: 400 }
      );
    }

    const { data: importJob, error: importJobErr } = await supabaseAdmin
      .from("import_jobs")
      .select("id, company_id")
      .eq("id", importJobId)
      .maybeSingle();

    if (importJobErr || !importJob) {
      return NextResponse.json(
        { ok: false, error: "Import job not found" },
        { status: 404 }
      );
    }

    const membership = await requireMembershipForCompany(
      String(importJob.company_id),
      auth.user.id
    );

    if (!membership) {
      return NextResponse.json(
        { ok: false, error: "Not a member of this company" },
        { status: 403 }
      );
    }

    const result = await finalizeImportRowsForJob(String(importJob.id));

    return NextResponse.json({
      ok: true,
      importJobId: String(importJob.id),
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected processing error",
      },
      { status: 500 }
    );
  }
}