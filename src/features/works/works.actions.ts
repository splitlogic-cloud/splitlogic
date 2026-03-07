"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/features/supabase/server";

export async function createWorkAction(formData: FormData) {
  const supabase = await createClient();

  const companyId = String(formData.get("company_id"));
  const title = String(formData.get("title") || "").trim();
  const isrc = String(formData.get("isrc") || "").trim();

  if (!companyId) {
    throw new Error("Missing company_id");
  }

  if (!title) {
    throw new Error("Title is required");
  }

  const { error } = await supabase.from("works").insert({
    company_id: companyId,
    title,
    isrc: isrc || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  redirect(`/c/${companyId}/works`);
}

export async function updateWorkAction() {
  throw new Error("updateWorkAction not implemented yet.");
}