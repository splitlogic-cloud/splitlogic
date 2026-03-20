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

function summarizeStatementLines(lines: StatementLineRow[]) {
  const totalAmount = lines.reduce((sum, line) => {
    return sum + (toNumberOrNull(line.allocated_amount) ?? 0);
  }, 0);

  return {
    line_count: lines.length,
    total_amount: totalAmount,
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
      totals: {
        line_count: 0,
        total_amount: 0,
      },
    };
  }

  const issues: string[] = [];

  if (!statement.party_id) {
    issues.push("Statement saknar party_id");
  }

  if (!statement.lines.length) {
    issues.push("Statement har inga rader");
  }

  const totals = summarizeStatementLines(statement.lines);

  if (totals.total_amount === 0) {
    issues.push("Statement total är 0");
  }

  const statementTotal = totals.total_amount;
  const ledgerTotal = totals.total_amount;
  const lineTotal = totals.total_amount;

  const hasError = !statement.party_id || !statement.lines.length;
  const hasWarning = !hasError && totals.total_amount === 0;

  return {
    level: pickQaLevel(hasError, hasWarning),
    issues,
    statementTotal,
    ledgerTotal,
    lineTotal,
    totals,
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