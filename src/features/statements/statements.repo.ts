import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type StatementStatus = "draft" | "sent" | "paid" | "void" | "voided";

export type StatementListRow = {
  id: string;
  company_id: string;
  party_id: string | null;
  party_name: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string | null;
  total_amount: number | null;
  currency: string | null;
  note: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string | null;
  created_by: string | null;
  generated_from: string | null;
};

export type StatementLineRow = {
  id: string;
  statement_id: string;
  company_id: string | null;
  party_id: string | null;
  work_id: string | null;
  work_title: string | null;
  line_label: string;
  amount: number | null;
  currency: string | null;
  row_count: number | null;
  created_at: string | null;
};

export type StatementDetail = StatementListRow & {
  lines: StatementLineRow[];
};

export type StatementHeader = {
  id: string;
  company_id: string;
  party_id: string | null;
  party_name: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string | null;
  total_amount: number | null;
  currency: string | null;
  note: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string | null;
  created_by: string | null;
  generated_from: string | null;
};

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toRowCount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapStatementRow(row: any): StatementListRow {
  return {
    id: row.id,
    company_id: row.company_id,
    party_id: row.party_id ?? null,
    party_name: row.parties?.name ?? null,
    period_start: row.period_start ?? null,
    period_end: row.period_end ?? null,
    status: row.status ?? null,
    total_amount: toNumber(row.total_amount),
    currency: row.currency ?? null,
    note: row.note ?? null,
    sent_at: row.sent_at ?? null,
    paid_at: row.paid_at ?? null,
    voided_at: row.voided_at ?? null,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    generated_from: row.generated_from ?? null,
  };
}

function mapStatementLineRow(row: any): StatementLineRow {
  return {
    id: row.id,
    statement_id: row.statement_id,
    company_id: row.company_id ?? null,
    party_id: row.party_id ?? null,
    work_id: row.work_id ?? null,
    work_title: row.works?.title ?? null,
    line_label: row.line_label ?? "—",
    amount: toNumber(row.amount),
    currency: row.currency ?? null,
    row_count: toRowCount(row.row_count),
    created_at: row.created_at ?? null,
  };
}

export async function listStatementsByCompany(
  companyId: string,
): Promise<StatementListRow[]> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select(
      `
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      total_amount,
      currency,
      note,
      sent_at,
      paid_at,
      voided_at,
      created_at,
      created_by,
      generated_from,
      parties:party_id (
        name
      )
    `,
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`listStatementsByCompany failed: ${error.message}`);
  }

  return (data ?? []).map(mapStatementRow);
}

export async function getStatementById(
  companyId: string,
  statementId: string,
): Promise<StatementDetail | null> {
  const header = await getStatementHeader(companyId, statementId);

  if (!header) {
    return null;
  }

  const lines = await listStatementLines(companyId, statementId);

  return {
    ...header,
    lines,
  };
}

export async function getStatementHeader(
  companyId: string,
  statementId: string,
): Promise<StatementHeader | null> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select(
      `
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      total_amount,
      currency,
      note,
      sent_at,
      paid_at,
      voided_at,
      created_at,
      created_by,
      generated_from,
      parties:party_id (
        name
      )
    `,
    )
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (error) {
    throw new Error(`getStatementHeader failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapStatementRow(data);
}

// Backward-compatible:
// - listStatementLines(statementId)
// - listStatementLines(companyId, statementId)
export async function listStatementLines(
  statementId: string,
): Promise<StatementLineRow[]>;
export async function listStatementLines(
  companyId: string,
  statementId: string,
): Promise<StatementLineRow[]>;
export async function listStatementLines(
  arg1: string,
  arg2?: string,
): Promise<StatementLineRow[]> {
  const companyId = arg2 ? arg1 : null;
  const statementId = arg2 ?? arg1;

  let query = supabaseAdmin
    .from("statement_lines")
    .select(
      `
      id,
      statement_id,
      company_id,
      party_id,
      work_id,
      line_label,
      amount,
      currency,
      row_count,
      created_at,
      works:work_id (
        title
      )
    `,
    )
    .eq("statement_id", statementId)
    .order("amount", { ascending: false });

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`listStatementLines failed: ${error.message}`);
  }

  return (data ?? []).map(mapStatementLineRow);
}