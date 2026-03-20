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
  currency: string | null;
  total_amount: number | null;
  generated_from: string | null;
  note: string | null;
  created_at: string | null;
  created_by: string | null;
};

export type StatementHeaderRow = {
  id: string;
  company_id: string;
  party_id: string | null;
  party_name: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string | null;
  currency: string | null;
  total_amount: number | null;
  generated_from: string | null;
  note: string | null;
  created_at: string | null;
  created_by: string | null;
};

export type StatementLineRow = {
  id: string;
  line_label: string | null;
  work_title: string | null;
  row_count: number | null;
  amount: number | null;
  currency: string | null;
};

export type StatementDetailRow = StatementHeaderRow & {
  lines: StatementLineRow[];
};

function asString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatementListRow(row: Record<string, unknown>): StatementListRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    party_id: asString(row.party_id),
    party_name: asString(row.party_name),
    period_start: asString(row.period_start),
    period_end: asString(row.period_end),
    status: asString(row.status),
    currency: asString(row.currency),
    total_amount: asNumber(row.total_amount),
    generated_from: asString(row.generated_from),
    note: asString(row.note),
    created_at: asString(row.created_at),
    created_by: asString(row.created_by),
  };
}

function normalizeStatementLineRow(row: Record<string, unknown>): StatementLineRow {
  return {
    id: String(row.id),
    line_label:
      asString(row.line_label) ??
      asString(row.label) ??
      asString(row.name),
    work_title:
      asString(row.work_title) ??
      asString(row.work_name) ??
      asString(row.title),
    row_count:
      asNumber(row.row_count) ??
      asNumber(row.source_row_count) ??
      asNumber(row.count),
    amount:
      asNumber(row.amount) ??
      asNumber(row.total_amount) ??
      asNumber(row.payable_amount),
    currency: asString(row.currency),
  };
}

export async function listStatementsByCompany(
  companyId: string
): Promise<StatementListRow[]> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select(`
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      total_amount,
      generated_from,
      note,
      created_at,
      created_by,
      parties (
        name
      )
    `)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`listStatementsByCompany failed: ${error.message}`);
  }

  return (data ?? []).map((row: any) =>
    normalizeStatementListRow({
      ...row,
      party_name: row.parties?.name ?? null,
    })
  );
}

export async function getStatementHeader(
  companyId: string,
  statementId: string
): Promise<StatementHeaderRow | null> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select(`
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      total_amount,
      generated_from,
      note,
      created_at,
      created_by,
      parties (
        name
      )
    `)
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (error) {
    throw new Error(`getStatementHeader failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    ...normalizeStatementListRow({
      ...data,
      party_name: (data as any).parties?.name ?? null,
    }),
  };
}

export async function listStatementLines(
  statementId: string
): Promise<StatementLineRow[]> {
  const { data, error } = await supabaseAdmin
    .from("statement_lines")
    .select(`
      id,
      line_label,
      work_title,
      row_count,
      amount,
      currency
    `)
    .eq("statement_id", statementId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`listStatementLines failed: ${error.message}`);
  }

  return (data ?? []).map((row: any) => normalizeStatementLineRow(row));
}

export async function getStatementById(
  companyId: string,
  statementId: string
): Promise<StatementDetailRow | null> {
  const [header, lines] = await Promise.all([
    getStatementHeader(companyId, statementId),
    listStatementLines(statementId),
  ]);

  if (!header) {
    return null;
  }

  return {
    ...header,
    lines,
  };
}