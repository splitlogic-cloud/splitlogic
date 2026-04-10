import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type StatementStatus = "draft" | "finalized" | "exported";

export type StatementListRow = {
  id: string;
  company_id: string;
  statement_run_id: string;
  party_id: string;
  party_name: string | null;
  period_start: string;
  period_end: string;
  status: StatementStatus;
  currency: string;
  total_amount: number;
  line_count: number;
  created_at: string | null;
  run_status: string | null;
  run_started_at: string | null;
  run_completed_at: string | null;
};

export type StatementHeaderRow = StatementListRow;

export type StatementLineRow = {
  id: string;
  statement_id: string;
  allocation_line_id: string;
  import_row_id: string;
  work_id: string | null;
  party_id: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  platform: string | null;
  territory: string | null;
  transaction_date: string | null;
  amount: number;
  currency: string;
  units: number | null;
  created_at: string | null;
};

export type StatementDetailRow = StatementHeaderRow & {
  lines: StatementLineRow[];
};

function asString(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return asObject(value[0]);
  }
  return asObject(value);
}

function toStatus(value: unknown): StatementStatus {
  const raw = asString(value);
  if (raw === "finalized" || raw === "exported") return raw;
  return "draft";
}

function normalizeListRow(row: Record<string, unknown>): StatementListRow {
  const parties = firstObject(row.parties);
  const run = firstObject(row.statement_runs);

  return {
    id: String(row.id),
    company_id: String(row.company_id),
    statement_run_id: String(row.statement_run_id),
    party_id: String(row.party_id),
    party_name: asString(parties?.name),
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    status: toStatus(row.status),
    currency: asString(row.currency) ?? "",
    total_amount: asNumber(row.total_amount) ?? 0,
    line_count: asNumber(row.line_count) ?? 0,
    created_at: asString(row.created_at),
    run_status: asString(run?.status),
    run_started_at: asString(run?.started_at),
    run_completed_at: asString(run?.completed_at),
  };
}

function normalizeLineRow(row: Record<string, unknown>): StatementLineRow {
  return {
    id: String(row.id),
    statement_id: String(row.statement_id),
    allocation_line_id: String(row.allocation_line_id),
    import_row_id: String(row.import_row_id),
    work_id: asString(row.work_id),
    party_id: String(row.party_id),
    title: asString(row.title),
    artist: asString(row.artist),
    isrc: asString(row.isrc),
    platform: asString(row.platform),
    territory: asString(row.territory),
    transaction_date: asString(row.transaction_date),
    amount: asNumber(row.amount) ?? 0,
    currency: asString(row.currency) ?? "",
    units: asNumber(row.units),
    created_at: asString(row.created_at),
  };
}

export async function listStatementsByCompany(
  companyId: string
): Promise<StatementListRow[]> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select(
      `
      id,
      company_id,
      statement_run_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      total_amount,
      line_count,
      created_at,
      parties(name),
      statement_runs(status, started_at, completed_at)
    `
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw new Error(`listStatementsByCompany failed: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeListRow);
}

export async function getStatementHeader(
  companyId: string,
  statementId: string
): Promise<StatementHeaderRow | null> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select(
      `
      id,
      company_id,
      statement_run_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      total_amount,
      line_count,
      created_at,
      parties(name),
      statement_runs(status, started_at, completed_at)
    `
    )
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (error) {
    throw new Error(`getStatementHeader failed: ${error.message}`);
  }

  if (!data) return null;
  return normalizeListRow(data as Record<string, unknown>);
}

export async function listStatementLines(
  statementId: string
): Promise<StatementLineRow[]> {
  const { data, error } = await supabaseAdmin
    .from("statement_lines")
    .select(
      `
      id,
      statement_id,
      allocation_line_id,
      import_row_id,
      work_id,
      party_id,
      title,
      artist,
      isrc,
      platform,
      territory,
      transaction_date,
      amount,
      currency,
      units,
      created_at
    `
    )
    .eq("statement_id", statementId)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`listStatementLines failed: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeLineRow);
}

export async function getStatementById(
  companyId: string,
  statementId: string
): Promise<StatementDetailRow | null> {
  const [header, lines] = await Promise.all([
    getStatementHeader(companyId, statementId),
    listStatementLines(statementId),
  ]);

  if (!header) return null;
  return { ...header, lines };
}