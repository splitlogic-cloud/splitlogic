"use server";

import { revalidatePath } from "next/cache";
import { runImportWorkMatching } from "@/features/imports/imports.match.service";

export async function runWorkMatchingAction(params: {
  companySlug: string;
  importJobId: string;
}) {
  const { companySlug, importJobId } = params;

  await runImportWorkMatching(importJobId);

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}