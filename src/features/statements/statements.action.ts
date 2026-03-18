"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";
import { lockStatementPeriod } from "@/features/statements/period-locks.repo";

type StatementStatus = "draft" | "sent" | "paid" | "void";

type CompanyRow = {
  id: string;
  slug: string | null;
  name?: string | null;
};

type StatementRow = {
  id: string;
  company_id: string;
  status: string | null;
  period_start: string | null;
  period_end: string | null;
  allocation_run_id: string | null;
};

async function getCompanyBySlug(companySlug: string): Promise<CompanyRow> {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Company not found");
  }

  return data as CompanyRow;
}

async function getStatementForCompany(statementId: string, companyId: string): Promise<StatementRow> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select("id, company_id, status, period_start, period_end, allocation_run_id")
    .eq("id", statementId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Statement not found");
  }

  return data as StatementRow;
}

export async function setStatementStatusAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const statementId = String(formData.get("statementId") ?? "");
  const nextStatus = String(formData.get("nextStatus") ?? "") as StatementStatus;

  if (!companySlug || !statementId || !nextStatus) {
    throw new Error("Missing companySlug, statementId or nextStatus");
  }

  if (!["draft", "sent", "paid", "void"].includes(nextStatus)) {
    throw new Error("Invalid statement status");
  }

  const company = await getCompanyBySlug(companySlug);
  const statement = await getStatementForCompany(statementId, company.id);

  const patch: Record<string, unknown> = {
    status: nextStatus,
  };

  if (nextStatus === "sent") {
    patch.sent_at = new Date().toISOString();
  }

  if (nextStatus === "paid") {
    patch.paid_at = new Date().toISOString();
  }

  if (nextStatus === "void") {
    patch.voided_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from("statements")
    .update(patch)
    .eq("id", statement.id)
    .eq("company_id", company.id);

  if (error) {
    throw new Error(`setStatementStatusAction failed: ${error.message}`);
  }

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement",
    entityId: statement.id,
    action: `statement.status.${nextStatus}`,
    payload: {
      previousStatus: statement.status,
      nextStatus,
    },
  });

  revalidatePath(`/c/${companySlug}/statements`);
  revalidatePath(`/c/${companySlug}/statements/${statementId}`);
}

export async function addStatementNoteAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const statementId = String(formData.get("statementId") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!companySlug || !statementId) {
    throw new Error("Missing companySlug or statementId");
  }

  const company = await getCompanyBySlug(companySlug);
  const statement = await getStatementForCompany(statementId, company.id);

  const { error } = await supabaseAdmin
    .from("statements")
    .update({
      note,
    })
    .eq("id", statement.id)
    .eq("company_id", company.id);

  if (error) {
    throw new Error(`addStatementNoteAction failed: ${error.message}`);
  }

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement",
    entityId: statement.id,
    action: "statement.note.updated",
    payload: {
      note,
    },
  });

  revalidatePath(`/c/${companySlug}/statements/${statementId}`);
}

export async function lockStatementPeriodAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const statementId = String(formData.get("statementId") ?? "");

  if (!companySlug || !statementId) {
    throw new Error("Missing companySlug or statementId");
  }

  const company = await getCompanyBySlug(companySlug);
  const statement = await getStatementForCompany(statementId, company.id);

  if (!statement.period_start || !statement.period_end) {
    throw new Error("Statement period is missing");
  }

  await lockStatementPeriod({
    companyId: company.id,
    periodStart: statement.period_start,
    periodEnd: statement.period_end,
    allocationRunId: statement.allocation_run_id ?? null,
    lockedBy: null,
  });

  const { error } = await supabaseAdmin
    .from("statements")
    .update({
      locked_at: new Date().toISOString(),
      locked_by: null,
    })
    .eq("id", statement.id)
    .eq("company_id", company.id);

  if (error) {
    throw new Error(`lockStatementPeriodAction failed: ${error.message}`);
  }

  await createAuditEvent({
    companyId: company.id,
    entityType: "statement",
    entityId: statement.id,
    action: "statement.locked",
    payload: {
      periodStart: statement.period_start,
      periodEnd: statement.period_end,
      allocationRunId: statement.allocation_run_id ?? null,
    },
  });

  revalidatePath(`/c/${companySlug}/statements`);
  revalidatePath(`/c/${companySlug}/statements/${statementId}`);
}