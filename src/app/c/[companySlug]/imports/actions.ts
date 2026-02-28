"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { deleteLatestImportJobForCompanyAdmin } from "@/features/imports/imports.repo";

export async function deleteLatestImportAction(companySlug: string) {
  const { company } = await requireCompanyBySlugForUser(companySlug);

  await deleteLatestImportJobForCompanyAdmin({ companyId: company.id });

  revalidatePath(`/c/${companySlug}/imports`);
}