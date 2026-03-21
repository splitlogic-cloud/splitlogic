"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { matchImportRowsForImport } from "@/features/imports/imports.matching";
import { runImportParse } from "@/features/imports/run-import-parse";

export async function runImportParseAction(formData: FormData) {
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

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", importJobId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (importJobError || !importJob) {
    throw new Error("Import job not found");
  }

  await runImportParse(importJobId);
  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}

export async function runMatchingAction(formData: FormData) {
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

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", importJobId)
    .eq("company_id", company.id)
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
    await matchImportRowsForImport({
      companyId: company.id,
      importJobId,
    });
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