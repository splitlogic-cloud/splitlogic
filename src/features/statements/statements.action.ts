"use server";

import { redirect } from "next/navigation";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { generateStatement } from "@/features/statements/statements.repo";

export async function createStatementFromDates(companySlug: string, formData: FormData) {
  const company = await requireCompanyBySlugForUser(companySlug);

  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();
  const amountFieldRaw = String(formData.get("amount_field") ?? "net").trim().toLowerCase();
  const amountField = (amountFieldRaw === "gross" ? "gross" : "net") as "net" | "gross";

  if (!periodStart || !periodEnd) throw new Error("period_start and period_end are required");

  const statementId = await generateStatement({
    companyId: company.id,
    periodStart,
    periodEnd,
    amountField,
  });

  redirect(`/c/${companySlug}/statements/${statementId}`);
}