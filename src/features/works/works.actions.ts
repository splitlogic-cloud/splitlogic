"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/features/supabase/server";
import { requireActiveCompany } from "@/lib/active-company";

function requireAdmin(role: string) {
  if (role !== "admin") throw new Error("Insufficient permissions");
}

export async function createWorkAction(companyId: string, formData: FormData) {
  const ctx = await requireActiveCompany(companyId);
  requireAdmin(ctx.role);

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required");

  const supabase = await createClient();
  const { error } = await supabase.from("works").insert({
    company_id: ctx.companyId,
    title,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/c/${companyId}/works`);
}

export async function updateWorkTitleAction(companyId: string, workId: string, formData: FormData) {
  const ctx = await requireActiveCompany(companyId);
  requireAdmin(ctx.role);

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required");

  const supabase = await createClient();

  const { error } = await supabase
    .from("works")
    .update({ title })
    .eq("company_id", ctx.companyId)
    .eq("id", workId);

  if (error) throw new Error(error.message);

  revalidatePath(`/c/${companyId}/works/${workId}`);
  revalidatePath(`/c/${companyId}/works`);
}

export async function deleteWorkAction(companyId: string, workId: string) {
  const ctx = await requireActiveCompany(companyId);
  requireAdmin(ctx.role);

  const supabase = await createClient();

  const { error } = await supabase
    .from("works")
    .delete()
    .eq("company_id", ctx.companyId)
    .eq("id", workId);

  if (error) throw new Error(error.message);

  revalidatePath(`/c/${companyId}/works`);
}