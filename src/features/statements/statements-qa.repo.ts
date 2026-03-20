import "server-only";

import {
  getStatementById,
  listStatementsByCompany,
  type StatementLineRow,
} from "@/features/statements/statements.repo";

export type QaLevel = "ok" | "warning" | "error";

export type GenerateStatementsPreviewRow = {
  party_id: string | null;
  party_name: string | null;
  line_count: number;
  total_amount: number;
  currency: string | null;
};

export type GenerateStatementsQaSummary = {
  level: QaLevel;
  issues: string[];
  total_candidates: number;
  zero_amount_candidates: number;
  missing_party_candidates: number;
};

export type StatementQaDetail = {
  level: QaLevel;
  issues: string[];
  statementTotal: number;
  ledgerTotal: number;
  lineTotal: number;
  sourceRowCount: number;
  diffVsLedger: number;
  diffVsLines: number;
  rowsMissingWork: number;
  rowsMissingRelease: number;
  rowsMissingParty: number;
  zeroAmountRows: number;
  currencies: string[];
  workCount: number;
  releaseCount: number;
  partyCount: number;
  totals: {
    line_count: number;
    total_amount: number;
  };
};

export type StatementQaStatusRow = {
  statement_id: string;
  level: QaLevel;
  issues: string[];
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickQaLevel(hasError: boolean, hasWarning: boolean): QaLevel {
  if (hasError) return "error";
  if (hasWarning) return "warning";
  return "ok";
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((v) => (v ?? "").trim())
        .filter((v) => v.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function summarizeStatementLines(lines: StatementLineRow[]) {
  const totalAmount = lines.reduce((sum, line) => {
    return sum + (toNumberOrNull(line.allocated_amount) ?? 0);
  }, 0);

  const rowsMissingWork = lines.filter((line) => !line.work_id && !line.work_title).length;
  const rowsMissingRelease = lines.filter((line) => !line.release_id && !line.release_title).length;
  const rowsMissingParty = lines.filter((line) => !line.party_id && !line.party_name).length;
  const zeroAmountRows = lines.filter(
    (line) => (toNumberOrNull(line.allocated_amount) ?? 0) === 0,
  ).length;

  const currencies = uniqueNonEmpty(lines.map((line) => line.currency));
  const workCount = new Set(
    lines
      .map((line) => line.work_id ?? line.work_title ?? null)
      .filter(Boolean),
  ).size;
  const releaseCount = new Set(
    lines
      .map((line) => line.release_id ?? line.release_title ?? null)
      .filter(Boolean),
  ).size;
  const partyCount = new Set(
    lines
      .map((line) => line.party_id ?? line.party_name ?? null)
      .filter(Boolean),
  ).size;

  return {
    line_count: lines.length,
    total_amount: totalAmount,
    rowsMissingWork,
    rowsMissingRelease,
    rowsMissingParty,
    zeroAmountRows,
    currencies,
    workCount,
    releaseCount,
    partyCount,
  };
}

export async function getGenerateStatementsPreview(
  companyId: string,
): Promise<GenerateStatementsPreviewRow[]> {
  const statements = await listStatementsByCompany(companyId);

  return statements.map((row) => ({
    party_id: row.party_id ?? null,
    party_name: row.party_name ?? null,
    line_count: 0,
    total_amount: row.total_amount ?? 0,
    currency: row.currency ?? null,
  }));
}

export async function getGenerateStatementsQaSummary(
  companyId: string,
): Promise<GenerateStatementsQaSummary> {
  const preview = await getGenerateStatementsPreview(companyId);

  const issues: string[] = [];
  let zeroAmountCandidates = 0;
  let missingPartyCandidates = 0;

  for (const row of preview) {
    if (!row.party_id) {
      missingPartyCandidates += 1;
    }
    if ((row.total_amount ?? 0) === 0) {
      zeroAmountCandidates += 1;
    }
  }

  if (missingPartyCandidates > 0) {
    issues.push(`${missingPartyCandidates} kandidat(er) saknar party`);
  }

  if (zeroAmountCandidates > 0) {
    issues.push(`${zeroAmountCandidates} kandidat(er) har 0 i totalbelopp`);
  }

  const level = pickQaLevel(
    missingPartyCandidates > 0,
    missingPartyCandidates === 0 && zeroAmountCandidates > 0,
  );

  return {
    level,
    issues,
    total_candidates: preview.length,
    zero_amount_candidates: zeroAmountCandidates,
    missing_party_candidates: missingPartyCandidates,
  };
}

export async function getStatementQaDetail(
  companyId: string,
  statementId: string,
): Promise<StatementQaDetail> {
  const statement = await getStatementById(companyId, statementId);

  if (!statement) {
    return {
      level: "error",
      issues: ["Statement saknas"],
      statementTotal: 0,
      ledgerTotal: 0,
      lineTotal: 0,
      sourceRowCount: 0,
      diffVsLedger: 0,
      diffVsLines: 0,
      rowsMissingWork: 0,
      rowsMissingRelease: 0,
      rowsMissingParty: 0,
      zeroAmountRows: 0,
      currencies: [],
      workCount: 0,
      releaseCount: 0,
      partyCount: 0,
      totals: {
        line_count: 0,
        total_amount: 0,
      },
    };
  }

  const totals = summarizeStatementLines(statement.lines);
  const issues: string[] = [];

  if (!statement.party_id) {
    issues.push("Statement saknar party_id");
  }

  if (!statement.lines.length) {
    issues.push("Statement har inga rader");
  }

  if (totals.total_amount === 0) {
    issues.push("Statement total är 0");
  }

  if (totals.rowsMissingWork > 0) {
    issues.push(`${totals.rowsMissingWork} rad(er) saknar work`);
  }

  if (totals.rowsMissingRelease > 0) {
    issues.push(`${totals.rowsMissingRelease} rad(er) saknar release`);
  }

  if (totals.rowsMissingParty > 0) {
    issues.push(`${totals.rowsMissingParty} rad(er) saknar party`);
  }

  if (totals.currencies.length > 1) {
    issues.push(`Statement innehåller flera valutor: ${totals.currencies.join(", ")}`);
  }

  const statementTotal = totals.total_amount;
  const ledgerTotal = totals.total_amount;
  const lineTotal = totals.total_amount;
  const sourceRowCount = statement.lines.length;
  const diffVsLedger = statementTotal - ledgerTotal;
  const diffVsLines = statementTotal - lineTotal;

  const hasError =
    !statement.party_id ||
    !statement.lines.length ||
    totals.rowsMissingParty > 0;

  const hasWarning =
    !hasError &&
    (totals.total_amount === 0 ||
      totals.rowsMissingWork > 0 ||
      totals.rowsMissingRelease > 0 ||
      totals.currencies.length > 1);

  return {
    level: pickQaLevel(hasError, hasWarning),
    issues,
    statementTotal,
    ledgerTotal,
    lineTotal,
    sourceRowCount,
    diffVsLedger,
    diffVsLines,
    rowsMissingWork: totals.rowsMissingWork,
    rowsMissingRelease: totals.rowsMissingRelease,
    rowsMissingParty: totals.rowsMissingParty,
    zeroAmountRows: totals.zeroAmountRows,
    currencies: totals.currencies,
    workCount: totals.workCount,
    releaseCount: totals.releaseCount,
    partyCount: totals.partyCount,
    totals: {
      line_count: totals.line_count,
      total_amount: totals.total_amount,
    },
  };
}

export async function listStatementQaStatusesByCompany(
  companyId: string,
): Promise<StatementQaStatusRow[]> {
  const statements = await listStatementsByCompany(companyId);

  const result: StatementQaStatusRow[] = [];

  for (const statement of statements) {
    const detail = await getStatementQaDetail(companyId, statement.id);

    result.push({
      statement_id: statement.id,
      level: detail.level,
      issues: detail.issues,
    });
  }

  return result;
}