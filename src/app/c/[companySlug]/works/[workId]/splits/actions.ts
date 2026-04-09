"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function getCompanyBySlug(companySlug: string) {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Company not found");
  }

  return data;
}

async function getWorkForCompany(workId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("works")
    .select("id, company_id")
    .eq("id", workId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Work not found for company");
  }

  return data;
}

async function getPartyForCompany(partyId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("parties")
    .select("id, company_id")
    .eq("id", partyId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Party not found for company");
  }

  return data;
}

async function getSplitForWork(splitId: string, workId: string, companyId: string) {
  const attempts: Array<{ table: "work_splits" | "splits"; select: string }> = [
    {
      table: "work_splits",
      select: "id, company_id, work_id, party_id, role, share_percent",
    },
    { table: "splits", select: "id, company_id, work_id, party_id, role, share_percent" },
  ];

  for (const attempt of attempts) {
    const { data, error } = await supabaseAdmin
      .from(attempt.table)
      .select(attempt.select)
      .eq("id", splitId)
      .eq("company_id", companyId)
      .eq("work_id", workId)
      .maybeSingle();

    if (!error && data) {
      const row = data as unknown as Record<string, unknown>;
      return {
        id: String(row.id),
        company_id: String(row.company_id),
        work_id: String(row.work_id),
        party_id: String(row.party_id),
        role: typeof row.role === "string" ? row.role : null,
        share_percent:
          typeof row.share_percent === "number" ? row.share_percent : Number(row.share_percent ?? 0),
        __table: attempt.table,
      };
    }
  }

  throw new Error("Split not found for work");
}

function parseSharePercent(raw: FormDataEntryValue | null) {
  const value = Number(String(raw ?? ""));

  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("sharePercent must be between 0 and 100");
  }

  return value;
}

function revalidateSplitPaths(companySlug: string, workId: string) {
  revalidatePath(`/c/${companySlug}/works`);
  revalidatePath(`/c/${companySlug}/works/${workId}`);
  revalidatePath(`/c/${companySlug}/works/${workId}/splits`);
}

export async function createSplitAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const workId = String(formData.get("workId") ?? "");
  const partyId = String(formData.get("partyId") ?? "");
  const role = String(formData.get("role") ?? "").trim();
  const sharePercent = parseSharePercent(formData.get("sharePercent"));

  if (!companySlug || !workId || !partyId) {
    throw new Error("Missing required split fields");
  }

  const company = await getCompanyBySlug(companySlug);
  await getWorkForCompany(workId, company.id);
  await getPartyForCompany(partyId, company.id);

  const normalizedRole = role || null;

  let existingSplit: { id: string } | null = null;
  for (const table of ["work_splits", "splits"] as const) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("id")
      .eq("company_id", company.id)
      .eq("work_id", workId)
      .eq("party_id", partyId)
      .eq("role", normalizedRole)
      .maybeSingle();

    if (!error && data) {
      existingSplit = data as { id: string };
      break;
    }
  }

  if (existingSplit) {
    throw new Error("A split already exists for this party and role on this work");
  }

  let createError: string | null = null;
  for (const payload of [
    {
      table: "work_splits" as const,
      value: {
        company_id: company.id,
        work_id: workId,
        party_id: partyId,
        role: normalizedRole,
        share_percent: sharePercent,
      },
    },
    {
      table: "splits" as const,
      value: {
        company_id: company.id,
        work_id: workId,
        party_id: partyId,
        role: normalizedRole,
        share_percent: sharePercent,
      },
    },
  ]) {
    const { error } = await supabaseAdmin.from(payload.table).insert(payload.value);
    if (!error) {
      createError = null;
      break;
    }
    createError = error.message;
  }

  if (createError) {
    throw new Error(`Failed to create split: ${createError}`);
  }

  revalidateSplitPaths(companySlug, workId);
}

export async function updateSplitAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const workId = String(formData.get("workId") ?? "");
  const splitId = String(formData.get("splitId") ?? "");
  const role = String(formData.get("role") ?? "").trim();
  const sharePercent = parseSharePercent(formData.get("sharePercent"));

  if (!companySlug || !workId || !splitId) {
    throw new Error("Missing required fields");
  }

  const company = await getCompanyBySlug(companySlug);
  await getWorkForCompany(workId, company.id);
  const split = await getSplitForWork(splitId, workId, company.id);

  const { error } = await supabaseAdmin
    .from(split.__table)
    .update({
      role: role || null,
      share_percent: sharePercent,
    })
    .eq("id", splitId)
    .eq("company_id", company.id)
    .eq("work_id", workId);

  if (error) {
    throw new Error(`Failed to update split: ${error.message}`);
  }

  revalidateSplitPaths(companySlug, workId);
}

export async function deleteSplitAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const workId = String(formData.get("workId") ?? "");
  const splitId = String(formData.get("splitId") ?? "");

  if (!companySlug || !workId || !splitId) {
    throw new Error("Missing required fields");
  }

  const company = await getCompanyBySlug(companySlug);
  await getWorkForCompany(workId, company.id);
  const split = await getSplitForWork(splitId, workId, company.id);

  const { error } = await supabaseAdmin
    .from(split.__table)
    .delete()
    .eq("id", splitId)
    .eq("company_id", company.id)
    .eq("work_id", workId);

  if (error) {
    throw new Error(`Failed to delete split: ${error.message}`);
  }

  revalidateSplitPaths(companySlug, workId);
}