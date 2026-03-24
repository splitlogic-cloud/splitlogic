"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { matchImportRowsForImport } from "@/features/imports/imports.matching";

type CompanyRecord = {
  id: string;
  slug: string | null;
};

export async function runMatchingV3Action(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId");
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  const typedCompany = company as CompanyRecord;

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, status")
    .eq("id", importJobId)
    .eq("company_id", typedCompany.id)
    .maybeSingle();

  if (importJobError || !importJob) {
    throw new Error("Import job not found");
  }

  const { error: setStatusError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: "matching",
      updated_at: new Date().toISOString(),
    })
    .eq("id", importJobId);

  if (setStatusError) {
    throw new Error(`Failed to set import job to matching: ${setStatusError.message}`);
  }

  try {
    await matchImportRowsForImport(typedCompany.id, importJobId);
  } catch (error) {
    await supabaseAdmin
      .from("import_jobs")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", importJobId);

    throw error;
  }

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}