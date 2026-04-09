"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CompanyRecord = {
  id: string;
  slug: string | null;
};

function isMissingColumnError(message: string, column?: string): boolean {
  const normalized = message.toLowerCase();
  const isSchemaError =
    normalized.includes("does not exist") ||
    normalized.includes("could not find") ||
    normalized.includes("schema cache");
  if (!isSchemaError) return false;
  if (!column) return true;
  return normalized.includes(column.toLowerCase());
}

async function insertPartyWithFallback(payload: {
  company_id: string;
  name: string;
  type: string | null;
  email: string | null;
}) {
  const attempts = [
    { select: "company_id, name, type, email", map: () => payload },
    {
      select: "name, type, email",
      map: () => ({
        name: payload.name,
        type: payload.type,
        email: payload.email,
      }),
    },
    {
      select: "company_id, name, type",
      map: () => ({
        company_id: payload.company_id,
        name: payload.name,
        type: payload.type,
      }),
    },
    {
      select: "company_id, name, email",
      map: () => ({
        company_id: payload.company_id,
        name: payload.name,
        email: payload.email,
      }),
    },
    {
      select: "company_id, name",
      map: () => ({
        company_id: payload.company_id,
        name: payload.name,
      }),
    },
    {
      select: "name, type",
      map: () => ({
        name: payload.name,
        type: payload.type,
      }),
    },
    {
      select: "name, email",
      map: () => ({
        name: payload.name,
        email: payload.email,
      }),
    },
    {
      select: "name",
      map: () => ({
        name: payload.name,
      }),
    },
  ] as const;

  let lastErrorMessage = "unknown";

  for (const attempt of attempts) {
    const { error } = await supabaseAdmin.from("parties").insert(attempt.map());
    if (!error) {
      return;
    }
    lastErrorMessage = error.message;

    const missingColumn = attempt.select
      .split(",")
      .map((v) => v.trim())
      .find((column) => error.message.includes(column));

    if (!missingColumn) {
      throw new Error(`create party failed: ${error.message}`);
    }
  }

  throw new Error(`create party failed: ${lastErrorMessage}`);
}

async function updatePartyWithFallback(params: {
  companyId: string;
  partyId: string;
  name: string;
  type: string | null;
  email: string | null;
  external_id: string | null;
}) {
  const attempts = [
    {
      select: "name, email, type, external_id, updated_at",
      map: () => ({
        name: params.name,
        email: params.email,
        type: params.type,
        external_id: params.external_id,
        updated_at: new Date().toISOString(),
      }),
    },
    {
      select: "name, email, type, external_id",
      map: () => ({
        name: params.name,
        email: params.email,
        type: params.type,
        external_id: params.external_id,
      }),
    },
    {
      select: "name, email, type",
      map: () => ({
        name: params.name,
        email: params.email,
        type: params.type,
      }),
    },
    {
      select: "name, type",
      map: () => ({
        name: params.name,
        type: params.type,
      }),
    },
    {
      select: "name, email",
      map: () => ({
        name: params.name,
        email: params.email,
      }),
    },
    {
      select: "name",
      map: () => ({
        name: params.name,
      }),
    },
  ] as const;

  let lastErrorMessage = "unknown";

  for (const attempt of attempts) {
    const payload = attempt.map();
    const { error } = await supabaseAdmin
      .from("parties")
      .update(payload)
      .eq("company_id", params.companyId)
      .eq("id", params.partyId);

    if (!error) {
      return;
    }

    if (isMissingColumnError(error.message, "company_id")) {
      const { error: fallbackError } = await supabaseAdmin
        .from("parties")
        .update(payload)
        .eq("id", params.partyId);

      if (!fallbackError) {
        return;
      }

      lastErrorMessage = fallbackError.message;
      if (!isMissingColumnError(fallbackError.message)) {
        throw new Error(`update party failed: ${fallbackError.message}`);
      }
      continue;
    }

    lastErrorMessage = error.message;

    const missingColumn = attempt.select
      .split(",")
      .map((v) => v.trim())
      .find((column) => error.message.includes(column));

    if (!missingColumn) {
      throw new Error(`update party failed: ${error.message}`);
    }
  }

  throw new Error(`update party failed: ${lastErrorMessage}`);
}

export async function createPartyAction(
  companySlug: string,
  formData: FormData
): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();

  if (!name) {
    throw new Error("Party name is required.");
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle<CompanyRecord>();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  const insertPayload: {
    company_id: string;
    name: string;
    type: string | null;
    email: string | null;
  } = {
    company_id: company.id,
    name,
    type: type || null,
    email: emailRaw || null,
  };

  await insertPartyWithFallback(insertPayload);

  revalidatePath(`/c/${companySlug}/parties`);
}

export async function deletePartyAction(
  companySlug: string,
  formData: FormData
): Promise<void> {
  const partyId = String(formData.get("partyId") ?? "").trim();

  if (!partyId) {
    throw new Error("Missing partyId.");
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle<CompanyRecord>();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  let partyQuery = supabaseAdmin
    .from("parties")
    .select("id")
    .eq("company_id", company.id)
    .eq("id", partyId)
    .maybeSingle();

  let { data: party, error: partyError } = await partyQuery;

  if (partyError && isMissingColumnError(partyError.message, "company_id")) {
    const fallback = await supabaseAdmin
      .from("parties")
      .select("id")
      .eq("id", partyId)
      .maybeSingle();
    party = fallback.data;
    partyError = fallback.error;
  }

  if (partyError) {
    throw new Error(`Failed to load party: ${partyError.message}`);
  }

  if (!party) {
    throw new Error("Party not found.");
  }

  let { error: deleteError } = await supabaseAdmin
    .from("parties")
    .delete()
    .eq("company_id", company.id)
    .eq("id", partyId);

  if (deleteError && isMissingColumnError(deleteError.message, "company_id")) {
    const fallback = await supabaseAdmin
      .from("parties")
      .delete()
      .eq("id", partyId);
    deleteError = fallback.error;
  }

  if (deleteError) {
    throw new Error(`delete party failed: ${deleteError.message}`);
  }

  revalidatePath(`/c/${companySlug}/parties`);
}

export async function updatePartyAction(
  companySlug: string,
  partyId: string,
  formData: FormData
): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "").trim();
  const externalIdRaw = String(formData.get("external_id") ?? "").trim();

  if (!name) {
    throw new Error("Party name is required.");
  }

  if (!partyId) {
    throw new Error("Missing partyId.");
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle<CompanyRecord>();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  let { data: party, error: partyError } = await supabaseAdmin
    .from("parties")
    .select("id")
    .eq("company_id", company.id)
    .eq("id", partyId)
    .maybeSingle();

  if (partyError && isMissingColumnError(partyError.message, "company_id")) {
    const fallback = await supabaseAdmin
      .from("parties")
      .select("id")
      .eq("id", partyId)
      .maybeSingle();
    party = fallback.data;
    partyError = fallback.error;
  }

  if (partyError) {
    throw new Error(`Failed to load party: ${partyError.message}`);
  }

  if (!party) {
    throw new Error("Party not found.");
  }

  await updatePartyWithFallback({
    companyId: company.id,
    partyId,
    name,
    type: typeRaw || null,
    email: emailRaw || null,
    external_id: externalIdRaw || null,
  });

  revalidatePath(`/c/${companySlug}/parties`);
  revalidatePath(`/c/${companySlug}/parties/${partyId}/edit`);
}