"use server";

import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { createWork, updateWork } from "@/features/works/works.repo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createWorkAction(companySlug: string, formData: FormData) {
  const company = await requireCompanyBySlugForUser(companySlug);

  const title = String(formData.get("title") ?? "").trim();
  const external_id = String(formData.get("external_id") ?? "").trim();
  const iswc = String(formData.get("iswc") ?? "").trim();

  if (!title) throw new Error("Title is required");

  await createWork(company.id, { title, external_id, iswc });

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("audit_write", {
    p_company_id: company.id,
    p_action: "WORK_CREATED",
    p_entity_type: "work",
    p_entity_id: external_id || null,
    p_metadata: { title },
  });

  revalidatePath(`/c/${companySlug}/works`);
}

export async function updateWorkAction(companySlug: string, id: string, formData: FormData) {
  const company = await requireCompanyBySlugForUser(companySlug);

  const title = String(formData.get("title") ?? "").trim();
  const external_id = String(formData.get("external_id") ?? "").trim();
  const iswc = String(formData.get("iswc") ?? "").trim();

  if (!title) throw new Error("Title is required");

  await updateWork(company.id, id, { title, external_id, iswc });

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("audit_write", {
    p_company_id: company.id,
    p_action: "WORK_UPDATED",
    p_entity_type: "work",
    p_entity_id: id,
    p_metadata: { title },
  });

  revalidatePath(`/c/${companySlug}/works`);
}