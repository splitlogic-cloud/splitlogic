"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runImportParse } from "@/features/imports/run-import-parse";
import { runImportStepSafely } from "@/features/imports/run-import-step-safely";

type CompanyRecord = {
  id: string;
  slug: string | null;
};

export async function runImportParseAction(formData: FormData): Promise<{
  importJobId: string;
  insertedRowCount: number;
  parsedRowCount: number;
  invalidRowCount: number;
  createdWorkCount: number;
}> {
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

  const result = await runImportStepSafely({
    importJobId,
    companyId: typedCompany.id,
    step: "parse",
    nextJobStatus: "parsed",
    work: async () => {
      return await runImportParse(importJobId);
    },
    payload: (parseResult) => ({
      insertedRowCount: parseResult.insertedRowCount,
      parsedRowCount: parseResult.parsedRowCount,
      invalidRowCount: parseResult.invalidRowCount,
      createdWorkCount: parseResult.createdWorkCount,
    }),
  });

  revalidatePath(`/c/${companySlug}/imports`);
  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
  revalidatePath(`/c/${companySlug}/allocations`);

  return result;
}