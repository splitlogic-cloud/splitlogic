"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/features/supabase/server";

const ALLOWED_PARTY_TYPES = [
  "artist",
  "producer",
  "writer",
  "label",
  "publisher",
  "manager",
  "other",
] as const;

export async function createPartyAction(formData: FormData) {
  const supabase = await createClient();

  const companyId = String(formData.get("company_id") || "").trim();
  const companySlug = String(formData.get("company_slug") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "").trim().toLowerCase();
  const externalIdRaw = String(formData.get("external_id") || "").trim();
  const ipiRaw = String(formData.get("ipi") || "").trim();

  if (!companyId) throw new Error("Missing company_id");
  if (!companySlug) throw new Error("Missing company_slug");
  if (!name) throw new Error("Name is required");

  if (!ALLOWED_PARTY_TYPES.includes(type as (typeof ALLOWED_PARTY_TYPES)[number])) {
    throw new Error(`Invalid party type: ${type}`);
  }

  const { error } = await supabase.from("parties").insert({
    company_id: companyId,
    name,
    type,
    external_id: externalIdRaw || null,
    ipi: ipiRaw || null,
  });

  if (error) throw new Error(`createPartyAction: ${error.message}`);

  redirect(`/c/${companySlug}/parties`);
}

export async function updatePartyAction() {
  throw new Error("updatePartyAction is not implemented yet.");
}