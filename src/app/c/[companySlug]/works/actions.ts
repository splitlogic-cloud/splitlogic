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

async function deleteSplitsForWork(companyId: string, workId: string): Promise<void> {
  const attempts: Array<{
    table: "work_splits" | "splits";
  }> = [{ table: "work_splits" }, { table: "splits" }];

  let lastErrorMessage = "";

  for (const attempt of attempts) {
    const { error } = await supabaseAdmin
      .from(attempt.table)
      .delete()
      .eq("company_id", companyId)
      .eq("work_id", workId);

    if (!error) {
      return;
    }

    lastErrorMessage = error.message;
    const missingRelation =
      error.message.includes("relation") ||
      error.message.includes("does not exist");
    const missingColumn =
      error.message.includes("Could not find the") ||
      error.message.includes("schema cache") ||
      error.message.includes("column");

    if (!missingRelation && !missingColumn) {
      throw new Error(`Failed to delete work splits (${attempt.table}): ${error.message}`);
    }
  }

  if (lastErrorMessage) {
    throw new Error(`Failed to delete work splits: ${lastErrorMessage}`);
  }
}

export async function deleteWorkAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const workId = String(formData.get("workId") ?? "");

  if (!companySlug || !workId) {
    throw new Error("Missing required fields");
  }

  const company = await getCompanyBySlug(companySlug);
  await getWorkForCompany(workId, company.id);

  await deleteSplitsForWork(company.id, workId);

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