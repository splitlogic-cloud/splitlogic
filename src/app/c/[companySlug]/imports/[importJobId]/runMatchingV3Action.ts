"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { matchImportRowsForImport } from "@/features/matching/match-import-rows";

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

  const { data: importJob, error: importError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", importJobId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (importError || !importJob) {
    throw new Error("Import job not found");
  }

  await matchImportRowsForImport({
    companyId: company.id,
    importId: importJob.id,
  });

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}