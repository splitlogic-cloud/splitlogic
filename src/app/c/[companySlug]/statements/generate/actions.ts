"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { generateStatements } from "@/features/statements/generate-statements";

function buildGeneratePath(params: {
  companySlug: string;
  periodStart?: string;
  periodEnd?: string;
  partyId?: string;
  error?: string;
}) {
  const query = new URLSearchParams();

  if (params.periodStart) query.set("periodStart", params.periodStart);
  if (params.periodEnd) query.set("periodEnd", params.periodEnd);
  if (params.partyId) query.set("partyId", params.partyId);
  if (params.error) query.set("error", params.error);

  const qs = query.toString();
  return `/c/${params.companySlug}/statements/generate${qs ? `?${qs}` : ""}`;
}

function isMissingRpcFunction(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("function") &&
    normalized.includes("does not exist")
  ) || normalized.includes("could not find the function");
}

function isMissingSchemaColumn(message: string, column: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes(column.toLowerCase()) &&
    (normalized.includes("does not exist") ||
      normalized.includes("schema cache") ||
      normalized.includes("could not find"))
  );
}

function isNextRedirectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function generateStatementsAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "").trim();
  const periodStart = String(formData.get("periodStart") ?? "").trim();
  const periodEnd = String(formData.get("periodEnd") ?? "").trim();
  const partyIdRaw = String(formData.get("partyId") ?? "").trim();

  if (!companySlug) {
    throw new Error("Missing companySlug.");
  }

  if (!periodStart || !periodEnd) {
    redirect(
      buildGeneratePath({
        companySlug,
        periodStart,
        periodEnd,
        partyId: partyIdRaw,
        error: "Välj både period start och period end.",
      })
    );
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (error) {
    redirect(
      buildGeneratePath({
        companySlug,
        periodStart,
        periodEnd,
        partyId: partyIdRaw,
        error: toMessage(error, "Kunde inte ansluta till databasen."),
      })
    );
  }

  let company: Awaited<ReturnType<typeof requireCompanyBySlugForUser>>;
  try {
    company = await requireCompanyBySlugForUser(companySlug);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirect(
      buildGeneratePath({
        companySlug,
        periodStart,
        periodEnd,
        partyId: partyIdRaw,
        error: toMessage(error, "Kunde inte läsa bolag."),
      })
    );
  }

  if (partyIdRaw) {
    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select("id")
      .eq("company_id", company.id)
      .eq("id", partyIdRaw)
      .maybeSingle();

    if (partyError || !party) {
      redirect(
        buildGeneratePath({
          companySlug,
          periodStart,
          periodEnd,
          partyId: partyIdRaw,
          error: partyError
            ? `Kunde inte validera party: ${partyError.message}`
            : "Vald party hittades inte för detta bolag.",
        })
      );
    }
  }

  // Prefer RPC when available: many installations already depend on it.
  const { data: generatedId, error: rpcError } = await supabase.rpc(
    "generate_statement",
    {
      p_company_id: company.id,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_party_id: partyIdRaw || null,
    }
  );

  if (!rpcError) {
    if (generatedId) {
      redirect(`/c/${companySlug}/statements/${String(generatedId)}`);
    }
    redirect(`/c/${companySlug}/statements`);
  }

  // Fallback to TS generator when RPC is missing OR references newer schema
  // columns that do not exist in older databases.
  if (
    !isMissingRpcFunction(rpcError.message) &&
    !isMissingSchemaColumn(rpcError.message, "created_by")
  ) {
    redirect(
      buildGeneratePath({
        companySlug,
        periodStart,
        periodEnd,
        partyId: partyIdRaw,
        error: `Generate misslyckades: ${rpcError.message}`,
      })
    );
  }

  try {
    const result = await generateStatements({
      companyId: company.id,
      periodStart,
      periodEnd,
      createdBy: null,
      partyId: partyIdRaw || null,
    });

    if (partyIdRaw && result.statementIds.length === 1) {
      redirect(`/c/${companySlug}/statements/${result.statementIds[0]}`);
    }

    redirect(`/c/${companySlug}/statements`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Okänt fel vid statement-generering.";

    redirect(
      buildGeneratePath({
        companySlug,
        periodStart,
        periodEnd,
        partyId: partyIdRaw,
        error: message,
      })
    );
  }
}