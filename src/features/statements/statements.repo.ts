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

export type StatementSourceAllocationLine = {
  id: string;
  company_id: string;
  import_row_id: string;
  party_id: string | null;
  work_id: string | null;
  currency: string | null;
  allocated_amount: number;
  earning_date: string | null;
};

export type StatementInsertRow = {
  company_id: string;
  party_id: string;
  period_start: string;
  period_end: string;
  status: StatementStatus;
  currency: string | null;
  total_amount: number;
  generated_from: string | null;
  created_by: string | null;
};

export type StatementLineInsertRow = {
  statement_id: string;
  line_label: string | null;
  work_title: string | null;
  row_count: number;
  amount: number;
  currency: string | null;
};

export type StatementLedgerInsertRow = {
  statement_id: string;
  allocation_row_id: string;
  work_id: string | null;
  earning_date: string | null;
  amount: number;
  currency: string | null;
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

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const maybeDate = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) {
    return maybeDate;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Number(value.toFixed(6));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunk size must be greater than 0");
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function pickStatementDate(row: {
  canonical: Record<string, unknown> | null;
  normalized: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
}): string | null {
  const candidates = [
    asString(row.canonical?.statement_date),
    asString(row.canonical?.statementDate),
    asString(row.canonical?.earning_date),
    asString(row.normalized?.statement_date),
    asString(row.normalized?.statementDate),
    asString(row.normalized?.earning_date),
    asString(row.raw?.statement_date),
    asString(row.raw?.statementDate),
    asString(row.raw?.earning_date),
    asString(row.raw?.["Statement Date"]),
    asString(row.raw?.["REPORT_START_DATE"]),
    asString(row.raw?.["REPORT_END_DATE"]),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDate(candidate);
    if (normalized) return normalized;
  }

  return null;
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
  const baseSelect = `
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      total_amount,
      note,
      created_at,
      created_by,
      parties (
        name
      )
    `;

  const { data, error } = await supabaseAdmin
    .from("statements")
    .select(baseSelect)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!error) {
    return (data ?? []).map((row: Record<string, unknown>) =>
      normalizeStatementListRow({
        ...row,
        generated_from: null,
        party_name: asString(asObject(row.parties)?.name) ?? null,
      })
    );
  }

  if (error.message.includes("generated_from")) {
    const legacySelect = `
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      total_amount,
      note,
      created_at,
      created_by,
      parties (
        name
      )
    `;

    const { data: legacyData, error: legacyError } = await supabaseAdmin
      .from("statements")
      .select(legacySelect)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (legacyError) {
      throw new Error(`listStatementsByCompany failed: ${legacyError.message}`);
    }

    return (legacyData ?? []).map((row: Record<string, unknown>) =>
      normalizeStatementListRow({
        ...row,
        generated_from: null,
        party_name: asString(asObject(row.parties)?.name) ?? null,
      })
    );
  }

  {
    throw new Error(`listStatementsByCompany failed: ${error.message}`);
  }
}

export async function getStatementHeader(
  companyId: string,
  statementId: string
): Promise<StatementHeaderRow | null> {
  const baseSelect = `
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      total_amount,
      note,
      created_at,
      created_by,
      parties (
        name
      )
    `;

  const { data, error } = await supabaseAdmin
    .from("statements")
    .select(baseSelect)
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (!error) {
    if (!data) {
      return null;
    }

    return {
      ...normalizeStatementListRow({
        ...data,
        generated_from: null,
        party_name: asString(asObject(data.parties)?.name) ?? null,
      }),
    };
  }

  if (error.message.includes("generated_from")) {
    const legacySelect = `
      id,
      company_id,
      party_id,
      period_start,
      period_end,
      status,
      currency,
      total_amount,
      note,
      created_at,
      created_by,
      parties (
        name
      )
    `;

    const { data: legacyData, error: legacyError } = await supabaseAdmin
      .from("statements")
      .select(legacySelect)
      .eq("company_id", companyId)
      .eq("id", statementId)
      .maybeSingle();

    if (legacyError) {
      throw new Error(`getStatementHeader failed: ${legacyError.message}`);
    }

    if (!legacyData) {
      return null;
    }

    return {
      ...normalizeStatementListRow({
        ...legacyData,
        generated_from: null,
        party_name: asString(asObject(legacyData.parties)?.name) ?? null,
      }),
    };
  }

  {
    throw new Error(`getStatementHeader failed: ${error.message}`);
  }
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

  return (data ?? []).map((row: Record<string, unknown>) =>
    normalizeStatementLineRow(row)
  );
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

async function listAllocatedImportRowsForPeriod(params: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<Map<string, string | null>> {
  const rowsById = new Map<string, string | null>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabaseAdmin
      .from("import_rows")
      .select("id, allocation_status, canonical, normalized, raw")
      .eq("company_id", params.companyId)
      .in("allocation_status", ["allocated", "completed"])
      .range(from, to);

    if (error) {
      throw new Error(`listAllocatedImportRowsForPeriod failed: ${error.message}`);
    }

    const batch = (data ?? []) as Array<{
      id: unknown;
      allocation_status: unknown;
      canonical: unknown;
      normalized: unknown;
      raw: unknown;
    }>;

    for (const row of batch) {
      const id = asString(row.id);
      if (!id) continue;

      const status = asString(row.allocation_status);
      if (status !== "allocated" && status !== "completed") continue;

      const statementDate = pickStatementDate({
        canonical: asObject(row.canonical),
        normalized: asObject(row.normalized),
        raw: asObject(row.raw),
      });

      if (!statementDate) continue;
      if (statementDate < params.periodStart || statementDate > params.periodEnd) continue;

      rowsById.set(id, statementDate);
    }

    if (batch.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rowsById;
}

export async function loadAllocationLinesForStatementGeneration(params: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<StatementSourceAllocationLine[]> {
  const importRowDates = await listAllocatedImportRowsForPeriod(params);
  const importRowIds = Array.from(importRowDates.keys());

  if (importRowIds.length === 0) {
    return [];
  }

  const lines: StatementSourceAllocationLine[] = [];

  for (const idsChunk of chunkArray(importRowIds, 500)) {
    const { data, error } = await supabaseAdmin
      .from("allocation_lines")
      .select("id, company_id, import_row_id, work_id, party_id, currency, allocated_amount")
      .eq("company_id", params.companyId)
      .in("import_row_id", idsChunk);

    if (error) {
      throw new Error(`loadAllocationLinesForStatementGeneration failed: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const id = asString(row.id);
      const companyId = asString(row.company_id);
      const importRowId = asString(row.import_row_id);
      const amount = asNumber(row.allocated_amount);

      if (!id || !companyId || !importRowId || amount == null) continue;

      const earningDate = importRowDates.get(importRowId) ?? null;

      lines.push({
        id,
        company_id: companyId,
        import_row_id: importRowId,
        party_id: asString(row.party_id),
        work_id: asString(row.work_id),
        currency: asString(row.currency),
        allocated_amount: roundMoney(amount),
        earning_date: earningDate,
      });
    }
  }

  return lines;
}

export async function replaceDraftStatementsForPeriod(params: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  generatedFrom: string | null;
}): Promise<void> {
  let query = supabaseAdmin
    .from("statements")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("status", "draft")
    .eq("period_start", params.periodStart)
    .eq("period_end", params.periodEnd);

  if (params.generatedFrom == null) {
    query = query.is("generated_from", null);
  } else {
    query = query.eq("generated_from", params.generatedFrom);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`replaceDraftStatementsForPeriod failed: ${error.message}`);
  }

  const ids = (data ?? [])
    .map((row) => asString((row as Record<string, unknown>).id))
    .filter((value): value is string => Boolean(value));

  if (ids.length === 0) return;

  const { error: ledgerDeleteError } = await supabaseAdmin
    .from("statement_ledger")
    .delete()
    .in("statement_id", ids);

  if (ledgerDeleteError) {
    throw new Error(`Failed to delete statement_ledger rows: ${ledgerDeleteError.message}`);
  }

  const { error: linesDeleteError } = await supabaseAdmin
    .from("statement_lines")
    .delete()
    .in("statement_id", ids);

  if (linesDeleteError) {
    throw new Error(`Failed to delete statement_lines rows: ${linesDeleteError.message}`);
  }

  const { error: statementsDeleteError } = await supabaseAdmin
    .from("statements")
    .delete()
    .eq("company_id", params.companyId)
    .in("id", ids);

  if (statementsDeleteError) {
    throw new Error(`Failed to delete draft statements: ${statementsDeleteError.message}`);
  }
}

export async function insertStatement(row: StatementInsertRow): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .insert({
      company_id: row.company_id,
      party_id: row.party_id,
      period_start: row.period_start,
      period_end: row.period_end,
      status: row.status,
      currency: row.currency,
      total_amount: roundMoney(row.total_amount),
      generated_from: row.generated_from,
      created_by: row.created_by,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`insertStatement failed: ${error.message}`);
  }

  return { id: String(data.id) };
}

export async function insertStatementLines(rows: StatementLineInsertRow[]): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabaseAdmin
    .from("statement_lines")
    .insert(
      rows.map((row) => ({
        statement_id: row.statement_id,
        line_label: row.line_label,
        work_title: row.work_title,
        row_count: row.row_count,
        amount: roundMoney(row.amount),
        currency: row.currency,
      }))
    );

  if (error) {
    throw new Error(`insertStatementLines failed: ${error.message}`);
  }
}

export async function insertStatementLedgerRows(rows: StatementLedgerInsertRow[]): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabaseAdmin
    .from("statement_ledger")
    .insert(
      rows.map((row) => ({
        statement_id: row.statement_id,
        allocation_row_id: row.allocation_row_id,
        work_id: row.work_id,
        earning_date: row.earning_date,
        amount: roundMoney(row.amount),
        currency: row.currency,
      }))
    );

  if (error) {
    throw new Error(`insertStatementLedgerRows failed: ${error.message}`);
  }
}

export async function getWorkTitlesByIds(workIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(workIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("works")
    .select("id, title")
    .in("id", ids);

  if (error) {
    throw new Error(`getWorkTitlesByIds failed: ${error.message}`);
  }

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = asString(row.id);
    const title = asString(row.title);
    if (!id || !title) continue;
    map.set(id, title);
  }

  return map;
}