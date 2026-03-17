"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAllocationEngineV1 } from "@/features/allocations/allocations.repo";

export async function runAllocationAction(
  companySlug: string,
  importJobId: string
) {
  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId");
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  const { data: importJob, error: importError } = await supabaseAdmin
    .from("import_jobs")
    .select("id")
    .eq("id", importJobId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (importError || !importJob) {
    throw new Error("Import job not found or does not belong to company");
  }

  const result = await runAllocationEngineV1({
    companyId: company.id,
    importId: importJob.id,
  });

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);

  return result;
}