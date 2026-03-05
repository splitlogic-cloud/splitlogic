"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

/**
 * Legacy wrapper kept for UI code that calls deleteLatestImportAction(companySlug)
 * Deletes the latest import job for that company.
 */
export async function deleteLatestImportAction(companySlug: string) {
  if (!companySlug || typeof companySlug !== "string") throw new Error("Missing companySlug");

  const company = await requireCompanyBySlugForUser(companySlug);
  if (!company?.id) throw new Error("Company not found");

  const supabase = await createSupabaseServerClient();

  // Latest job for company
  const { data: job, error: jErr } = await supabase
    .from("import_jobs")
    .select("id, company_id")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jErr) throw new Error(`load latest import job failed: ${jErr.message}`);
  if (!job) return { ok: true };

  // Delete rows first
  const { error: rErr } = await supabase.from("import_rows").delete().eq("import_id", job.id);
  if (rErr) throw new Error(`delete import_rows failed: ${rErr.message}`);

  // Delete job
  const { error: dErr } = await supabase.from("import_jobs").delete().eq("id", job.id);
  if (dErr) throw new Error(`delete import_job failed: ${dErr.message}`);

  revalidatePath(`/c/${companySlug}/imports`);
  return { ok: true };
}