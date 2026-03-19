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

  return (data ?? []).map((row: any) => ({
    id: row.id,
    company_id: row.company_id,
    party_id: row.party_id ?? null,
    party_name: row.parties?.name ?? null,
    period_start: row.period_start ?? null,
    period_end: row.period_end ?? null,
    status: row.status ?? null,
    total_amount: row.total_amount == null ? null : Number(row.total_amount),
    currency: row.currency ?? null,
    note: row.note ?? null,
    sent_at: row.sent_at ?? null,
    paid_at: row.paid_at ?? null,
    voided_at: row.voided_at ?? null,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    generated_from: row.generated_from ?? null,
  }));
}

export async function getStatementById(
  companyId: string,
  statementId: string,
): Promise<StatementDetail | null> {
  const { data: statement, error: statementError } = await supabaseAdmin
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

  if (statementError) {
    throw new Error(`getStatementById failed: ${statementError.message}`);
  }

  if (!statement) {
    return null;
  }

  const { data: lines, error: linesError } = await supabaseAdmin
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

  if (linesError) {
    throw new Error(`getStatementById lines failed: ${linesError.message}`);
  }

  const mappedLines: StatementLineRow[] = (lines ?? []).map((row: any) => ({
    id: row.id,
    statement_id: row.statement_id,
    company_id: row.company_id ?? null,
    party_id: row.party_id ?? null,
    work_id: row.work_id ?? null,
    work_title: row.works?.title ?? null,
    line_label: row.line_label,
    amount: row.amount == null ? null : Number(row.amount),
    currency: row.currency ?? null,
    row_count: row.row_count ?? null,
    created_at: row.created_at ?? null,
  }));

  return {
    id: statement.id,
    company_id: statement.company_id,
    party_id: statement.party_id ?? null,
    party_name: statement.parties?.name ?? null,
    period_start: statement.period_start ?? null,
    period_end: statement.period_end ?? null,
    status: statement.status ?? null,
    total_amount: statement.total_amount == null ? null : Number(statement.total_amount),
    currency: statement.currency ?? null,
    note: statement.note ?? null,
    sent_at: statement.sent_at ?? null,
    paid_at: statement.paid_at ?? null,
    voided_at: statement.voided_at ?? null,
    created_at: statement.created_at ?? null,
    created_by: statement.created_by ?? null,
    generated_from: statement.generated_from ?? null,
    lines: mappedLines,
  };
}