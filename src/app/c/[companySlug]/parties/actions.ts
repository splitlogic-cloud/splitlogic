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