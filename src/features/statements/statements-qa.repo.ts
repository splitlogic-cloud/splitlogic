import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type QaLevel = "ok" | "warning" | "blocked";

export type StatementQaPreviewRow = {
  allocationRowId: string;
  earningDate: string | null;
  workId: string | null;
  allocatedAmount: number | null;
  currency: string | null;
};

export type StatementQaDetail = {
  level: QaLevel;
  statementTotal: number | null;
  ledgerTotal: number | null;
  lineTotal: number | null;
  diffVsLedger: number | null;
  diffVsLines: number | null;
  sourceRowCount: number;
  rowsMissingWork: number;
  currencies: string[];
  issues: string[];
  previewRows: StatementQaPreviewRow[];
};

export type StatementQaStatusRow = {
  statement_id: string;
  level: QaLevel;
  diff_vs_ledger: number | null;
  diff_vs_lines: number | null;
  rows_missing_work: number;
  issue_count: number;
};

export type GenerateStatementsPreviewRow = {
  party_id: string;
  party_name: string | null;
  currency: string | null;
  row_count: number;
  total_amount: number;
  works_count: number;
};

type GeneratePreviewImportRowRaw = {
  matched_work_id: unknown;
  currency: unknown;
  net_amount: unknown;
  gross_amount: unknown;
  party_id?: unknown;
};

export type GenerateStatementsQaSummary = {
  level: QaLevel;
  candidateCount: number;
  currencies: string[];
  totalAmount: number;
  rowsMissingWork: number;
  unmatchedRows: number;
  issues: string[];
};

type StatementHeaderRow = {
  id: string;
  company_id: string;
  currency: string | null;
  total_amount: number | null;
};

type StatementLedgerRow = {
  amount: number | null;
  currency: string | null;
  allocation_row_id: string | null;
  work_id: string | null;
  earning_date: string | null;
};

type StatementLineRow = {
  amount: number | null;
  currency: string | null;
};

type ImportRowCandidate = {
  matched_work_id: string | null;
  currency: string | null;
  net_amount: number | null;
  gross_amount: number | null;
  party_id: string | null;
  party_name: string | null;
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

function round2(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 100) / 100;
}

function abs(value: number | null): number | null {
  if (value == null) return null;
  return Math.abs(value);
}

function sumNumbers(values: Array<number | null | undefined>): number {
  return values.reduce((sum, value) => sum + Number(value ?? 0), 0);
}

function pickAmount(row: {
  net_amount?: number | null;
  gross_amount?: number | null;
}): number {
  if (row.net_amount != null) return Number(row.net_amount);
  if (row.gross_amount != null) return Number(row.gross_amount);
  return 0;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: unknown }).code;
  const maybeMessage = (error as { message?: unknown }).message;
  const code = typeof maybeCode === "string" ? maybeCode : "";
  const message =
    typeof maybeMessage === "string" ? maybeMessage.toLowerCase() : "";

  return (
    code === "42703" ||
    (message.includes(columnName.toLowerCase()) &&
      (message.includes("does not exist") || message.includes("column")))
  );
}

function determineQaLevel(params: {
  diffVsLedger?: number | null;
  diffVsLines?: number | null;
  rowsMissingWork?: number;
  unmatchedRows?: number;
  currencies?: string[];
  issues?: string[];
}): QaLevel {
  const hasBlockingDiff =
    (params.diffVsLedger != null && params.diffVsLedger > 0.01) ||
    (params.diffVsLines != null && params.diffVsLines > 0.01) ||
    Number(params.rowsMissingWork ?? 0) > 0 ||
    Number(params.unmatchedRows ?? 0) > 0;

  if (hasBlockingDiff) {
    return "blocked";
  }

  const hasWarnings =
    (params.issues?.length ?? 0) > 0 || (params.currencies?.length ?? 0) > 1;

  if (hasWarnings) {
    return "warning";
  }

  return "ok";
}

async function getStatementHeader(
  companyId: string,
  statementId: string
): Promise<StatementHeaderRow | null> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select("id, company_id, currency, total_amount")
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load statement header: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    company_id: String(data.company_id),
    currency: asString(data.currency),
    total_amount: asNumber(data.total_amount),
  };
}

async function getStatementLines(statementId: string): Promise<StatementLineRow[]> {
  const { data, error } = await supabaseAdmin
    .from("statement_lines")
    .select("amount, currency")
    .eq("statement_id", statementId);

  if (error) {
    throw new Error(`Failed to load statement lines for QA: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    amount: asNumber(row.amount),
    currency: asString(row.currency),
  }));
}

async function getStatementLedger(statementId: string): Promise<StatementLedgerRow[]> {
  const { data, error } = await supabaseAdmin
    .from("statement_ledger")
    .select("amount, currency, allocation_row_id, work_id, earning_date")
    .eq("statement_id", statementId);

  if (error) {
    throw new Error(`Failed to load statement ledger for QA: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    amount: asNumber(row.amount),
    currency: asString(row.currency),
    allocation_row_id: asString(row.allocation_row_id),
    work_id: asString(row.work_id),
    earning_date: asString(row.earning_date),
  }));
}

function buildStatementQaDetail(params: {
  statementTotal: number | null;
  lineRows: StatementLineRow[];
  ledgerRows: StatementLedgerRow[];
}): StatementQaDetail {
  const lineTotal = round2(sumNumbers(params.lineRows.map((row) => row.amount)));
  const ledgerTotal = round2(sumNumbers(params.ledgerRows.map((row) => row.amount)));
  const statementTotal = round2(params.statementTotal);

  const diffVsLedger = abs(round2((statementTotal ?? 0) - (ledgerTotal ?? 0)));
  const diffVsLines = abs(round2((statementTotal ?? 0) - (lineTotal ?? 0)));

  const sourceRowCount = params.ledgerRows.filter(
    (row) => row.allocation_row_id != null
  ).length;

  const rowsMissingWork = params.ledgerRows.filter((row) => row.work_id == null).length;

  const currencies = uniqueStrings([
    ...params.lineRows.map((row) => row.currency),
    ...params.ledgerRows.map((row) => row.currency),
  ]);

  const issues: string[] = [];

  if (diffVsLedger != null && diffVsLedger > 0.01) {
    issues.push(
      `Statement total differs from ledger total by ${diffVsLedger.toFixed(2)}.`
    );
  }

  if (diffVsLines != null && diffVsLines > 0.01) {
    issues.push(
      `Statement total differs from line total by ${diffVsLines.toFixed(2)}.`
    );
  }

  if (sourceRowCount === 0) {
    issues.push("No linked ledger rows found for this statement.");
  }

  if (rowsMissingWork > 0) {
    issues.push(`${rowsMissingWork} linked ledger rows are missing work_id.`);
  }

  if (currencies.length > 1) {
    issues.push("Multiple currencies detected across statement lines / ledger.");
  }

  const previewRows: StatementQaPreviewRow[] = params.ledgerRows
    .slice(0, 50)
    .map((row, index) => ({
      allocationRowId:
        row.allocation_row_id ?? `ledger_row_${index + 1}`,
      earningDate: row.earning_date,
      workId: row.work_id,
      allocatedAmount: row.amount,
      currency: row.currency,
    }));

  const level = determineQaLevel({
    diffVsLedger,
    diffVsLines,
    rowsMissingWork,
    currencies,
    issues,
  });

  return {
    level,
    statementTotal,
    ledgerTotal,
    lineTotal,
    diffVsLedger,
    diffVsLines,
    sourceRowCount,
    rowsMissingWork,
    currencies,
    issues,
    previewRows,
  };
}

export async function getStatementQaDetail(
  companyId: string,
  statementId: string
): Promise<StatementQaDetail | null> {
  const header = await getStatementHeader(companyId, statementId);

  if (!header) {
    return null;
  }

  const [lineRows, ledgerRows] = await Promise.all([
    getStatementLines(statementId),
    getStatementLedger(statementId),
  ]);

  return buildStatementQaDetail({
    statementTotal: header.total_amount,
    lineRows,
    ledgerRows,
  });
}

export async function listStatementQaStatusesByCompany(
  companyId: string
): Promise<StatementQaStatusRow[]> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select("id, total_amount")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load statements for QA statuses: ${error.message}`);
  }

  const statements = data ?? [];

  const results = await Promise.all(
    statements.map(async (statement) => {
      const detail = await getStatementQaDetail(companyId, String(statement.id));

      if (!detail) {
        return {
          statement_id: String(statement.id),
          level: "blocked" as QaLevel,
          diff_vs_ledger: null,
          diff_vs_lines: null,
          rows_missing_work: 0,
          issue_count: 1,
        };
      }

      return {
        statement_id: String(statement.id),
        level: detail.level,
        diff_vs_ledger: detail.diffVsLedger,
        diff_vs_lines: detail.diffVsLines,
        rows_missing_work: detail.rowsMissingWork,
        issue_count: detail.issues.length,
      };
    })
  );

  return results;
}

export async function getGenerateStatementsPreview(
  companyId: string
): Promise<GenerateStatementsPreviewRow[]> {
  const { data, error } = await supabaseAdmin
    .from("allocation_lines")
    .select("party_id, currency, allocated_amount, work_id")
    .eq("company_id", companyId)
    .limit(20000);

  if (error) {
    throw new Error(`Failed to load generate-statements preview: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    party_id: string | null;
    currency: string | null;
    allocated_amount: number | string | null;
    work_id: string | null;
  }>;

  const partyIds = uniqueStrings(rows.map((row) => row.party_id));
  const partyNameById = new Map<string, string>();

  if (partyIds.length > 0) {
    const { data: parties, error: partiesError } = await supabaseAdmin
      .from("parties")
      .select("id, name")
      .eq("company_id", companyId)
      .in("id", partyIds);

    if (partiesError) {
      throw new Error(
        `Failed to load party names for generate-statements preview: ${partiesError.message}`
      );
    }

    for (const row of parties ?? []) {
      const id = asString(row.id);
      const name = asString(row.name);
      if (id) {
        partyNameById.set(id, name ?? id);
      }
    }
  }

  const grouped = new Map<
    string,
    GenerateStatementsPreviewRow & { workIds: Set<string> }
  >();

  for (const row of rows) {
    const partyId = row.party_id ?? "unassigned";
    const partyName = row.party_id ? partyNameById.get(row.party_id) ?? null : null;
    const currency = row.currency ?? null;
    const amount = asNumber(row.allocated_amount) ?? 0;
    const key = `${partyId}__${currency ?? "NO_CCY"}`;

    const current = grouped.get(key) ?? {
      party_id: partyId,
      party_name: partyName,
      currency,
      row_count: 0,
      total_amount: 0,
      works_count: 0,
      workIds: new Set<string>(),
    };

    current.row_count += 1;
    current.total_amount = round2(current.total_amount + amount) ?? 0;

    if (row.work_id) {
      current.workIds.add(row.work_id);
    }

    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((group) => ({
      party_id: group.party_id,
      party_name: group.party_name,
      currency: group.currency,
      row_count: group.row_count,
      total_amount: group.total_amount,
      works_count: group.workIds.size,
    }))
    .sort((a, b) => b.total_amount - a.total_amount);
}

export async function getGenerateStatementsQaSummary(
  companyId: string
): Promise<GenerateStatementsQaSummary> {
  const { data, error } = await supabaseAdmin
    .from("allocation_lines")
    .select("party_id, work_id, currency, allocated_amount")
    .eq("company_id", companyId)
    .limit(20000);

  if (error) {
    throw new Error(`Failed to load generate-statements QA summary: ${error.message}`);
  }

  const rows = (data ?? []).map((row) => ({
    party_id: asString(row.party_id),
    work_id: asString(row.work_id),
    currency: asString(row.currency),
    allocated_amount: asNumber(row.allocated_amount),
  }));

  const currencies = uniqueStrings(rows.map((row) => row.currency));
  const totalAmount =
    round2(rows.reduce((sum, row) => sum + (row.allocated_amount ?? 0), 0)) ?? 0;
  const rowsMissingWork = rows.filter((row) => row.work_id == null).length;
  const unmatchedRows = 0;
  const candidateCount = new Set(
    rows.map((row) => `${row.party_id ?? "unassigned"}::${row.currency ?? "NO_CCY"}`)
  ).size;

  const issues: string[] = [];

  if (rows.length === 0) {
    issues.push("No allocation lines found for statement generation.");
  }

  if (rowsMissingWork > 0) {
    issues.push(`${rowsMissingWork} rows are missing matched_work_id.`);
  }

  if (currencies.length > 1) {
    issues.push("Multiple currencies detected in statement generation preview.");
  }

  const level = determineQaLevel({
    rowsMissingWork,
    unmatchedRows,
    currencies,
    issues,
  });

  return {
    level,
    candidateCount,
    currencies,
    totalAmount,
    rowsMissingWork,
    unmatchedRows,
    issues,
  };
}