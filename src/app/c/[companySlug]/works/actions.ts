"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function getCompanyBySlug(companySlug: string) {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Company not found");
  }

  return data;
}

async function getWorkForCompany(workId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("works")
    .select("id, company_id")
    .eq("id", workId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Work not found for company");
  }

  return data;
}

export async function deleteWorkAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const workId = String(formData.get("workId") ?? "");

  if (!companySlug || !workId) {
    throw new Error("Missing required fields");
  }

  const company = await getCompanyBySlug(companySlug);
  await getWorkForCompany(workId, company.id);

  const { error: splitDeleteError } = await supabaseAdmin
    .from("splits")
    .delete()
    .eq("company_id", company.id)
    .eq("work_id", workId);

  if (splitDeleteError) {
    throw new Error(`Failed to delete work splits: ${splitDeleteError.message}`);
  }

  const { error: workDeleteError } = await supabaseAdmin
    .from("works")
    .delete()
    .eq("id", workId)
    .eq("company_id", company.id);

  if (workDeleteError) {
    throw new Error(`Failed to delete work: ${workDeleteError.message}`);
  }

  revalidatePath(`/c/${companySlug}/works`);
}