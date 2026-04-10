"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateStatements } from "@/features/statements/generate-statements";

export async function generateStatementsAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "").trim();
  const periodStart = String(formData.get("periodStart") ?? "").trim();
  const periodEnd = String(formData.get("periodEnd") ?? "").trim();
  const partyIdRaw = String(formData.get("partyId") ?? "").trim();
  const supabase = await createClient();

  if (!companySlug) {
    throw new Error("Missing companySlug.");
  }

  if (!periodStart || !periodEnd) {
    throw new Error("Missing periodStart or periodEnd.");
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error("Company not found.");
  }

  if (partyIdRaw) {
    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select("id")
      .eq("company_id", company.id)
      .eq("id", partyIdRaw)
      .maybeSingle();

    if (partyError) {
      throw new Error(`Failed to validate party: ${partyError.message}`);
    }

    if (!party) {
      throw new Error("Selected party was not found for this company.");
    }
  }

  const result = await generateStatements({
    companyId: company.id,
    periodStart,
    periodEnd,
    createdBy: null,
    partyId: partyIdRaw || null,
  });

  if (partyIdRaw && result.statementIds.length === 1) {
    redirect(`/c/${companySlug}/statements/${result.statementIds[0]}`);
  }

  redirect(`/c/${companySlug}/statements`);
}