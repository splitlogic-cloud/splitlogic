"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateStatements } from "@/features/statements/generate-statements";

export async function generateStatementsAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "").trim();
  const periodStart = String(formData.get("periodStart") ?? "").trim();
  const periodEnd = String(formData.get("periodEnd") ?? "").trim();
  const partyIdRaw = String(formData.get("partyId") ?? "").trim();

  if (!companySlug) {
    throw new Error("Missing companySlug.");
  }

  if (!periodStart || !periodEnd) {
    throw new Error("Missing periodStart or periodEnd.");
  }

  const { data: company, error: companyError } = await supabaseAdmin
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
    const { data: party, error: partyError } = await supabaseAdmin
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

    const { data: generatedId, error: generateError } = await supabaseAdmin.rpc(
      "generate_statement",
      {
        p_company_id: company.id,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_party_id: partyIdRaw,
      }
    );

    if (generateError) {
      throw new Error(`generate_statement failed: ${generateError.message}`);
    }

    if (generatedId) {
      redirect(`/c/${companySlug}/statements/${String(generatedId)}`);
    }
  } else {
    await generateStatements({
      companyId: company.id,
      periodStart,
      periodEnd,
      createdBy: null,
    });
  }

  redirect(`/c/${companySlug}/statements`);
}