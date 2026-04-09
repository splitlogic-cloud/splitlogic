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

function isMissingSchemaEntity(message: string, entities: string[]): boolean {
  const normalized = message.toLowerCase();
  if (
    !normalized.includes("does not exist") &&
    !normalized.includes("could not find") &&
    !normalized.includes("not found in the schema cache")
  ) {
    return false;
  }

  return entities.some((entity) => normalized.includes(entity.toLowerCase()));
}

function isMissingColumnOrTable(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("could not find") ||
    normalized.includes("schema cache") ||
    normalized.includes("relation")
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
    if (isMissingSchemaEntity(error.message, ["currency", "total_amount"])) {
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin
        .from("statements")
        .select("id, company_id")
        .eq("company_id", companyId)
        .eq("id", statementId)
        .maybeSingle();

      if (fallbackError) {
        throw new Error(`Failed to load statement header: ${fallbackError.message}`);
      }

      if (!fallbackData) {
        return null;
      }

      return {
        id: String(fallbackData.id),
        company_id: String(fallbackData.company_id),
        currency: null,
        total_amount: null,
      };
    }

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
    if (
      isMissingSchemaEntity(error.message, [
        "statement_lines",
        "amount",
        "currency",
        "statement_id",
      ])
    ) {
      return [];
    }
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
    if (
      isMissingSchemaEntity(error.message, [
        "statement_ledger",
        "amount",
        "currency",
        "allocation_row_id",
        "work_id",
        "earning_date",
        "statement_id",
      ])
    ) {
      return [];
    }
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

  let statements = data ?? [];

  if (error) {
    if (isMissingSchemaEntity(error.message, ["created_at"])) {
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin
        .from("statements")
        .select("id, total_amount")
        .eq("company_id", companyId)
        .limit(200);

      if (fallbackError) {
        throw new Error(`Failed to load statements for QA statuses: ${fallbackError.message}`);
      }

      statements = fallbackData ?? [];
    } else {
      throw new Error(`Failed to load statements for QA statuses: ${error.message}`);
    }
  }

  const results = await Promise.all(
    statements.map(async (statement) => {
      let detail: StatementQaDetail | null = null;

      try {
        detail = await getStatementQaDetail(companyId, String(statement.id));
      } catch {
        detail = null;
      }

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
  _companyId: string
): Promise<GenerateStatementsPreviewRow[]> {
  const selectAttempts = [
    "matched_work_id, currency, net_amount, gross_amount, party_id, party_name",
    "matched_work_id, currency, net_amount, gross_amount, party_id",
    "matched_work_id, currency, net_amount, gross_amount",
  ] as const;
  const statusAttempts = ["allocation_status", "status"] as const;
  const orderAttempts = ["created_at", "row_number", "id"] as const;

  let data: unknown[] | null = null;
  let lastErrorMessage = "unknown";

  outer: for (const selectColumns of selectAttempts) {
    for (const statusColumn of statusAttempts) {
      for (const orderColumn of orderAttempts) {
        const query = await supabaseAdmin
          .from("import_rows")
          .select(selectColumns)
          .eq(statusColumn, "completed")
          .order(orderColumn, { ascending: false })
          .limit(5000);

        if (!query.error) {
          data = (query.data ?? []) as unknown[];
          break outer;
        }

        lastErrorMessage = query.error.message;
        if (!isMissingColumnOrTable(query.error.message)) {
          throw new Error(
            `Failed to load generate-statements preview: ${query.error.message}`
          );
        }
      }
    }
  }

  if (data == null) {
    throw new Error(
      `Failed to load generate-statements preview: ${lastErrorMessage}`
    );
  }

  const rows: ImportRowCandidate[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    matched_work_id: asString(row.matched_work_id),
    currency: asString(row.currency),
    net_amount: asNumber(row.net_amount),
    gross_amount: asNumber(row.gross_amount),
    party_id: asString(row.party_id),
    party_name: asString(row.party_name),
  }));

  const grouped = new Map<string, GenerateStatementsPreviewRow>();

  for (const row of rows) {
    const partyId = row.party_id ?? "unassigned";
    const partyName = row.party_name ?? null;
    const currency = row.currency ?? null;
    const amount = pickAmount(row);
    const key = `${partyId}__${currency ?? "NO_CCY"}`;

    const current = grouped.get(key) ?? {
      party_id: partyId,
      party_name: partyName,
      currency,
      row_count: 0,
      total_amount: 0,
      works_count: 0,
    };

    current.row_count += 1;
    current.total_amount = round2(current.total_amount + amount) ?? 0;

    if (row.matched_work_id) {
      current.works_count += 1;
    }

    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => b.total_amount - a.total_amount);
}

export async function getGenerateStatementsQaSummary(
  _companyId: string
): Promise<GenerateStatementsQaSummary> {
  const selectColumns = "matched_work_id, currency, net_amount, gross_amount";
  const statusAttempts = ["allocation_status", "status"] as const;
  const orderAttempts = ["created_at", "row_number", "id"] as const;

  let data: unknown[] | null = null;
  let lastErrorMessage = "unknown";

  outer: for (const statusColumn of statusAttempts) {
    for (const orderColumn of orderAttempts) {
      const query = await supabaseAdmin
        .from("import_rows")
        .select(selectColumns)
        .eq(statusColumn, "completed")
        .order(orderColumn, { ascending: false })
        .limit(5000);

      if (!query.error) {
        data = (query.data ?? []) as unknown[];
        break outer;
      }

      lastErrorMessage = query.error.message;
      if (!isMissingColumnOrTable(query.error.message)) {
        throw new Error(
          `Failed to load generate-statements QA summary: ${query.error.message}`
        );
      }
    }
  }

  if (data == null) {
    throw new Error(
      `Failed to load generate-statements QA summary: ${lastErrorMessage}`
    );
  }

  const rows: ImportRowCandidate[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    matched_work_id: asString(row.matched_work_id),
    currency: asString(row.currency),
    net_amount: asNumber(row.net_amount),
    gross_amount: asNumber(row.gross_amount),
    party_id: null,
    party_name: null,
  }));

  const currencies = uniqueStrings(rows.map((row) => row.currency));
  const totalAmount = round2(rows.reduce((sum, row) => sum + pickAmount(row), 0)) ?? 0;
  const rowsMissingWork = rows.filter((row) => row.matched_work_id == null).length;
  const unmatchedRows = rowsMissingWork;

  const issues: string[] = [];

  if (rows.length === 0) {
    issues.push("No allocation-completed import rows found for statement generation.");
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
    candidateCount: rows.length,
    currencies,
    totalAmount,
    rowsMissingWork,
    unmatchedRows,
    issues,
  };
}