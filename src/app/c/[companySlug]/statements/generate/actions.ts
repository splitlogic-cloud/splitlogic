"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateStatements } from "@/features/statements/generate-statements";

export async function generateStatementsAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "").trim();
  const periodStart = String(formData.get("periodStart") ?? "").trim();
  const periodEnd = String(formData.get("periodEnd") ?? "").trim();

  if (!companySlug) {
    throw new Error("Missing companySlug.");
  }

  if (!periodStart || !periodEnd) {
    throw new Error("Missing periodStart or periodEnd.");
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error("Company not found.");
  }

  await generateStatements({
    companyId: company.id,
    periodStart,
    periodEnd,
    createdBy: null,
  });

  redirect(`/c/${companySlug}/statements`);
}