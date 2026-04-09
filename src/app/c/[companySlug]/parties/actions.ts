"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CompanyRecord = {
  id: string;
  slug: string | null;
};

export async function createPartyAction(
  companySlug: string,
  formData: FormData
): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();

  if (!name) {
    throw new Error("Party name is required.");
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle<CompanyRecord>();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  const insertPayload: {
    company_id: string;
    name: string;
    type: string | null;
    email: string | null;
  } = {
    company_id: company.id,
    name,
    type: type || null,
    email: emailRaw || null,
  };

  const { error } = await supabaseAdmin.from("parties").insert(insertPayload);

  if (error) {
    throw new Error(`create party failed: ${error.message}`);
  }

  revalidatePath(`/c/${companySlug}/parties`);
}

export async function deletePartyAction(
  companySlug: string,
  formData: FormData
): Promise<void> {
  const partyId = String(formData.get("partyId") ?? "").trim();

  if (!partyId) {
    throw new Error("Missing partyId.");
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle<CompanyRecord>();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  const { data: party, error: partyError } = await supabaseAdmin
    .from("parties")
    .select("id")
    .eq("company_id", company.id)
    .eq("id", partyId)
    .maybeSingle();

  if (partyError) {
    throw new Error(`Failed to load party: ${partyError.message}`);
  }

  if (!party) {
    throw new Error("Party not found.");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("parties")
    .delete()
    .eq("company_id", company.id)
    .eq("id", partyId);

  if (deleteError) {
    throw new Error(`delete party failed: ${deleteError.message}`);
  }

  revalidatePath(`/c/${companySlug}/parties`);
}