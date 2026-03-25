import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAllocation } from "@/features/allocations/run-allocation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  companySlug?: string;
  importJobId?: string;
};

export async function POST(req: Request) {
  try {
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

    const result = await runAllocation(importJobId);

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