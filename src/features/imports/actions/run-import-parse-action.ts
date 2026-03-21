"use server";

import { revalidatePath } from "next/cache";
import { runImportParse } from "../run-import-parse";

export async function runImportParseAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId");
  }

  const result = await runImportParse(importJobId);

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
  revalidatePath(`/c/${companySlug}/imports`);

  return result;
}