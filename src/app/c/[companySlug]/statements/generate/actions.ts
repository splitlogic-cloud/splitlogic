"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateStatements } from "@/features/statements/generate-statements";

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

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

  try {
    await generateStatements({
      companyId: company.id,
      periodStart,
      periodEnd,
      createdBy: null,
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    redirect(
      `/c/${companySlug}/statements/generate?periodStart=${encodeURIComponent(
        periodStart
      )}&periodEnd=${encodeURIComponent(periodEnd)}&error=${encodeURIComponent(
        message
      )}`
    );
  }

  redirect(`/c/${companySlug}/statements`);
}