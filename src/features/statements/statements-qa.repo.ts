import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type QaLevel = "ok" | "warning" | "blocked";

export type GenerateStatementsPreviewRow = {
  party_id: string;
  party_name: string | null;
  currency: string | null;
  row_count: number;
  works_count: number;
  total_amount: number;
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

export type StatementQaStatusRow = {
  statement_id: string;
  level: QaLevel;
  diff_vs_lines: number | null;
  rows_missing_work: number;
  issue_count: number;
};

export type StatementQaPreviewRow = {
  lineId: string;
  transactionDate: string | null;
  workId: string | null;
  title: string | null;
  amount: number;
  currency: string;
};

export type StatementQaDetail = {
  level: QaLevel;
  statementTotal: number;
  lineTotal: number;
  diffVsLines: number;
  sourceRowCount: number;
  rowsMissingWork: number;
  currencies: string[];
  issues: string[];
  previewRows: StatementQaPreviewRow[];
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

function roundMoney(value: number): number {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function determineGenerateLevel(params: {
  candidateCount: number;
  rowsMissingWork: number;
  unmatchedRows: number;
  currencies: string[];
}): QaLevel {
  if (params.candidateCount === 0) return "blocked";
  if (params.rowsMissingWork > 0 || params.unmatchedRows > 0) return "blocked";
  if (params.currencies.length > 1) return "warning";
  return "ok";
}

function determineStatementLevel(params: {
  diffVsLines: number;
  rowsMissingWork: number;
  lineCount: number;
  currencies: string[];
}): QaLevel {
  if (params.lineCount === 0) return "blocked";
  if (params.diffVsLines > 0.01 || params.rowsMissingWork > 0) return "blocked";
  if (params.currencies.length > 1) return "warning";
  return "ok";
}

function shouldIncludeCurrencyIssue(currencies: string[]): boolean {
  return currencies.length > 1;
}

type CandidateRow = {
  id: string;
  party_id: string | null;
  currency: string | null;
  work_id: string | null;
  allocated_amount: number | null;
  parties: { name: string | null } | null;
};

async function loadCandidateRows(companyId: string): Promise<CandidateRow[]> {
  const { data, error } = await supabaseAdmin
    .from("allocation_lines")
    .select(
      `
      id,
      party_id,
      currency,
      work_id,
      allocated_amount,
      parties(name)
    `
    )
    .eq("company_id", companyId);

  if (error) {
    throw new Error(`Failed to load statement candidates: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    party_id: asString(row.party_id),
    currency: asString(row.currency),
    work_id: asString(row.work_id),
    allocated_amount: asNumber(row.allocated_amount),
    parties: Array.isArray(row.parties)
      ? ((row.parties[0] as { name?: string | null } | undefined)
          ? { name: asString((row.parties[0] as { name?: string | null }).name) }
          : null)
      : ((row.parties as { name?: string | null } | null)
          ? { name: asString((row.parties as { name?: string | null }).name) }
          : null),
  }));
}

export async function getGenerateStatementsPreview(
  companyId: string
): Promise<GenerateStatementsPreviewRow[]> {
  const rows = (await loadCandidateRows(companyId)).filter(
    (row) => Math.abs(Number(row.allocated_amount ?? 0)) > 0.0000001
  );
  const grouped = new Map<string, GenerateStatementsPreviewRow>();

  for (const row of rows) {
    const key = `${row.party_id ?? "unassigned"}__${row.currency ?? "none"}`;
    const existing = grouped.get(key) ?? {
      party_id: row.party_id ?? "unassigned",
      party_name: row.parties?.name ?? null,
      currency: row.currency,
      row_count: 0,
      works_count: 0,
      total_amount: 0,
    };

    existing.row_count += 1;
    if (row.work_id) existing.works_count += 1;
    existing.total_amount = roundMoney(
      existing.total_amount + Number(row.allocated_amount ?? 0)
    );
    grouped.set(key, existing);
  }

  return [...grouped.values()].sort((a, b) => b.total_amount - a.total_amount);
}

export async function getGenerateStatementsQaSummary(
  companyId: string
): Promise<GenerateStatementsQaSummary> {
  const rows = await loadCandidateRows(companyId);
  const candidateCount = rows.length;
  const totalAmount = roundMoney(
    rows.reduce((sum, row) => sum + Number(row.allocated_amount ?? 0), 0)
  );
  const rowsMissingWork = rows.filter((row) => !row.work_id).length;
  const unmatchedRows = rows.filter((row) => !row.party_id).length;
  const currencies = [...new Set(rows.map((row) => row.currency).filter(Boolean))] as string[];

  const issues: string[] = [];
  if (candidateCount === 0) {
    issues.push("No allocation rows found for statement generation.");
  }
  if (rowsMissingWork > 0) {
    issues.push(`${rowsMissingWork} rows are missing work_id.`);
  }
  if (unmatchedRows > 0) {
    issues.push(`${unmatchedRows} rows are missing party_id.`);
  }
  if (shouldIncludeCurrencyIssue(currencies)) {
    issues.push("Multiple currencies detected; generation will split by party/currency.");
  }

  return {
    level: determineGenerateLevel({
      candidateCount,
      rowsMissingWork,
      unmatchedRows,
      currencies,
    }),
    candidateCount,
    currencies,
    totalAmount,
    rowsMissingWork,
    unmatchedRows,
    issues,
  };
}

type StatementHeader = {
  id: string;
  company_id: string;
  total_amount: number;
};

type StatementLine = {
  id: string;
  amount: number;
  currency: string;
  work_id: string | null;
  transaction_date: string | null;
  created_at: string;
  title: string | null;
};

async function getStatementHeader(
  companyId: string,
  statementId: string
): Promise<StatementHeader | null> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select("id, company_id, total_amount")
    .eq("company_id", companyId)
    .eq("id", statementId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load statement header for QA: ${error.message}`);
  }
  if (!data) return null;

  return {
    id: String(data.id),
    company_id: String(data.company_id),
    total_amount: asNumber(data.total_amount) ?? 0,
  };
}

async function getStatementLines(statementId: string): Promise<StatementLine[]> {
  const { data, error } = await supabaseAdmin
    .from("statement_lines")
    .select("id, amount, currency, work_id, transaction_date, created_at, title")
    .eq("statement_id", statementId)
    .order("transaction_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load statement lines for QA: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    amount: asNumber(row.amount) ?? 0,
    currency: asString(row.currency) ?? "",
    work_id: asString(row.work_id),
    transaction_date: asString(row.transaction_date),
    created_at: asString(row.created_at) ?? "",
    title: asString(row.title),
  }));
}

export async function getStatementQaDetail(
  companyId: string,
  statementId: string
): Promise<StatementQaDetail | null> {
  const header = await getStatementHeader(companyId, statementId);
  if (!header) return null;

  const lines = await getStatementLines(statementId);
  const lineTotal = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  const statementTotal = roundMoney(header.total_amount);
  const diffVsLines = roundMoney(Math.abs(statementTotal - lineTotal));
  const rowsMissingWork = lines.filter((line) => !line.work_id).length;
  const currencies = [...new Set(lines.map((line) => line.currency).filter(Boolean))];

  const issues: string[] = [];
  if (diffVsLines > 0.01) {
    issues.push(`Statement total differs from lines by ${diffVsLines.toFixed(6)}.`);
  }
  if (rowsMissingWork > 0) {
    issues.push(`${rowsMissingWork} statement lines are missing work_id.`);
  }
  if (lines.length === 0) {
    issues.push("No statement lines found.");
  }

  return {
    level: determineStatementLevel({
      diffVsLines,
      rowsMissingWork,
      lineCount: lines.length,
      currencies,
    }),
    statementTotal,
    lineTotal,
    diffVsLines,
    sourceRowCount: lines.length,
    rowsMissingWork,
    currencies,
    issues,
    previewRows: lines.slice(0, 50).map((line) => ({
      lineId: line.id,
      transactionDate: line.transaction_date,
      workId: line.work_id,
      title: line.title,
      amount: line.amount,
      currency: line.currency,
    })),
  };
}

export async function listStatementQaStatusesByCompany(
  companyId: string
): Promise<StatementQaStatusRow[]> {
  const { data, error } = await supabaseAdmin
    .from("statements")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load statements for QA: ${error.message}`);
  }

  const statuses = await Promise.all(
    (data ?? []).map(async (statement) => {
      const detail = await getStatementQaDetail(companyId, String(statement.id));
      if (!detail) {
        return {
          statement_id: String(statement.id),
          level: "blocked" as QaLevel,
          diff_vs_lines: null,
          rows_missing_work: 0,
          issue_count: 1,
        };
      }
      return {
        statement_id: String(statement.id),
        level:
          detail.issues.length === 1 &&
          detail.issues[0] ===
            "No statement lines found."
            ? "warning"
            : detail.level,
        diff_vs_lines: detail.diffVsLines,
        rows_missing_work: detail.rowsMissingWork,
        issue_count: detail.issues.length,
      };
    })
  );

  return statuses;
}
