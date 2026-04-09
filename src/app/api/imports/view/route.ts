import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveMemberCompanyId } from "@/lib/company-membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const requestedCompanyId = String(body.companyId ?? "").trim();
    const companySlug = String(body.companySlug ?? "").trim();
    const importJobId = String(body.importJobId ?? "").trim();

    if (!importJobId || (!requestedCompanyId && !companySlug)) {
      return NextResponse.json(
        { ok: false, error: "missing importJobId and company scope" },
        { status: 400 }
      );
    }

    const companyId = requestedCompanyId
      ? await resolveMemberCompanyId(auth.user.id, { companyId: requestedCompanyId })
      : await resolveMemberCompanyId(auth.user.id, { companySlug });

    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "Not a member of this company" },
        { status: 403 }
      );
    }

    // load job
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("import_jobs")
      .select("id,status,source,filename,created_at")
      .eq("id", importJobId)
      .eq("company_id", companyId)
      .single();

    if (jobErr) {
      return NextResponse.json({ ok: false, error: jobErr.message }, { status: 500 });
    }

    let rows: unknown[] = [];
    const byImportJobId = await supabaseAdmin
      .from("import_rows")
      .select("id,row_number,status,error,raw")
      .eq("import_job_id", importJobId)
      .order("row_number", { ascending: true })
      .limit(2000);

    if (!byImportJobId.error) {
      rows = byImportJobId.data ?? [];
    } else {
      const byImportId = await supabaseAdmin
        .from("import_rows")
        .select("id,row_number,status,error,raw")
        .eq("import_id", importJobId)
        .order("row_number", { ascending: true })
        .limit(2000);

      if (byImportId.error) {
        return NextResponse.json({ ok: false, error: byImportId.error.message }, { status: 500 });
      }

      rows = byImportId.data ?? [];
    }

    return NextResponse.json({ ok: true, job, rows: rows ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status: 500 });
  }
}