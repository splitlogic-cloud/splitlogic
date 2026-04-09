import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAllocationForImportJob } from "@/features/allocations/allocations.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  companySlug?: string;
  importJobId?: string;
};

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user ?? null;

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as RequestBody;

    const companySlug = String(body.companySlug ?? "");
    const importJobId = String(body.importJobId ?? "");

    if (!companySlug || !importJobId) {
      return NextResponse.json(
        { ok: false, error: "Missing companySlug or importJobId" },
        { status: 400 }
      );
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, slug")
      .eq("slug", companySlug)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json(
        { ok: false, error: "Company not found" },
        { status: 404 }
      );
    }

    const membershipByUserId = await supabaseAdmin
      .from("company_memberships")
      .select("role")
      .eq("company_id", company.id)
      .eq("user_id", user.id)
      .maybeSingle();

    let hasMembership = Boolean(membershipByUserId.data);

    if (!hasMembership) {
      const membershipByProfileId = await supabaseAdmin
        .from("company_memberships")
        .select("role")
        .eq("company_id", company.id)
        .eq("profile_id", user.id)
        .maybeSingle();

      if (membershipByProfileId.error) {
        return NextResponse.json(
          { ok: false, error: membershipByProfileId.error.message },
          { status: 500 }
        );
      }

      hasMembership = Boolean(membershipByProfileId.data);
    }

    if (!hasMembership) {
      return NextResponse.json(
        { ok: false, error: "Not a member of this company" },
        { status: 403 }
      );
    }

    const { data: importJob, error: importJobError } = await supabaseAdmin
      .from("import_jobs")
      .select("id, company_id")
      .eq("id", importJobId)
      .eq("company_id", company.id)
      .maybeSingle();

    if (importJobError || !importJob) {
      return NextResponse.json(
        { ok: false, error: "Import job not found" },
        { status: 404 }
      );
    }

    console.log("[api.run-allocation] starting", {
      companySlug,
      importJobId,
      companyId: company.id,
    });

    const result = await runAllocationForImportJob({
      companyId: company.id,
      importJobId,
      createdBy: null,
    });

    revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
    revalidatePath(`/c/${companySlug}/allocations`);

    console.log("[api.run-allocation] completed", {
      companySlug,
      importJobId,
      result,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("[api.run-allocation] failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Allocation failed",
      },
      { status: 500 }
    );
  }
}