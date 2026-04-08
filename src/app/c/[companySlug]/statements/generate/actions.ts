"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateStatements } from "@/features/statements/generate-statements";

export type GenerateStatementsActionState = {
  ok: boolean;
  error: string | null;
};

export async function generateStatementsAction(
  _prevState: GenerateStatementsActionState,
  formData: FormData
): Promise<GenerateStatementsActionState> {
  const companySlug = String(formData.get("companySlug") ?? "").trim();
  const periodStart = String(formData.get("periodStart") ?? "").trim();
  const periodEnd = String(formData.get("periodEnd") ?? "").trim();

  if (!companySlug) {
    return { ok: false, error: "Missing company slug." };
  }

  if (!periodStart || !periodEnd) {
    return { ok: false, error: "Please choose both period start and period end." };
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    return { ok: false, error: `Failed to load company: ${companyError.message}` };
  }

  if (!company) {
    return { ok: false, error: "Company not found." };
  }

  try {
    await generateStatements({
      companyId: company.id,
      periodStart,
      periodEnd,
      createdBy: null,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to generate statements.";
    return { ok: false, error: message };
  }

  redirect(
    `/c/${companySlug}/statements?success=${encodeURIComponent(
      `Generated statements for ${periodStart} to ${periodEnd}.`
    )}`
  );
}