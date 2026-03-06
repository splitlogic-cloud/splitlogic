// src/app/c/[companySlug]/statements/actions.ts
"use server";

import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

/**
 * Server Action used by StatementsListClient:
 * form fields:
 * - period_start (YYYY-MM-DD)
 * - period_end (YYYY-MM-DD)
 * - amount_field: 'net' | 'gross'
 * - party_id: uuid | '' (optional)
 *
 * Requires RPC in DB:
 *   public.generate_statement(p_company_id uuid, p_period_start date, p_period_end date, p_party_id uuid default null)
 * If your RPC has a different signature, tell me and I will adapt.
 */
export async function createStatementFromDates(companySlug: string, formData: FormData) {
  if (!companySlug) throw new Error("Missing companySlug");

  const company = await requireCompanyBySlugForUser(companySlug);
  const supabase = await createSupabaseServerClient();

  const periodStart = String(formData.get("period_start") ?? "").trim();
  const periodEnd = String(formData.get("period_end") ?? "").trim();

  // optional
  const amountFieldRaw = String(formData.get("amount_field") ?? "net").trim().toLowerCase();
  const amountField = amountFieldRaw === "gross" ? "gross" : "net";

  const partyIdRaw = String(formData.get("party_id") ?? "").trim();
  const partyId = partyIdRaw.length ? partyIdRaw : null;

  if (!periodStart || !periodEnd) {
    throw new Error("period_start and period_end are required");
  }

  // Preferred: DB RPC handles creation + lines + audit.
  // NOTE: amount_field is not used by the default RPC unless you implemented it.
  // It is still read here for future compatibility.
  const { data, error } = await supabase.rpc("generate_statement", {
    p_company_id: company.id,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_party_id: partyId,
  });

  if (error) {
    throw new Error(`generate_statement failed: ${error.message}`);
  }

  const statementId = String(data);
  if (!statementId) throw new Error("generate_statement returned empty id");

  // Best-effort: if you want to store amount_field on statements later, add a column and update here.
  // await supabase.from("statements").update({ amount_field: amountField }).eq("id", statementId).eq("company_id", company.id);

  redirect(`/c/${companySlug}/statements/${statementId}`);
}