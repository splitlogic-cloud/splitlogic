"use server";

import { revalidatePath } from "next/cache";
import { runAllocation } from "../run-allocation";

export async function runAllocationAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId");
  }

  const result = await runAllocation(importJobId);

  revalidatePath(`/c/${companySlug}/imports`);
  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
  revalidatePath(`/c/${companySlug}/statements`);

  return result;
}