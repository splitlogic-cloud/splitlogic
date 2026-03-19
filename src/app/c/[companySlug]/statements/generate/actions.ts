"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateStatementsFromLedger } from "@/features/statements/generate-statements";

export async function generateStatementsAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!companySlug) {
    throw new Error("Missing companySlug");
  }

  if (!periodStart || !periodEnd) {
    throw new Error("Missing periodStart or periodEnd");
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id,slug,name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  await generateStatementsFromLedger({
    companyId: company.id,
    periodStart,
    periodEnd,
    note: note || null,
  });

  revalidatePath(`/c/${companySlug}/statements`);
  revalidatePath(`/c/${companySlug}/statements/generate`);

  redirect(`/c/${companySlug}/statements`);
}