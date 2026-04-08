import "server-only";

import { createAuditEvent } from "@/features/audit/audit.repo";
import {
  getWorkTitlesByIds,
  insertStatement,
  insertStatementLedgerRows,
  insertStatementLines,
  loadAllocationLinesForStatementGeneration,
  replaceDraftStatementsForPeriod,
  type StatementLedgerInsertRow,
  type StatementLineInsertRow,
  type StatementSourceAllocationLine,
} from "@/features/statements/statements.repo";

export type GenerateStatementsParams = {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  createdBy?: string | null;
};

export type GeneratedStatementResult = {
  statementIds: string[];
  count: number;
};

type StatementGroup = {
  partyId: string;
  currency: string | null;
  rows: StatementSourceAllocationLine[];
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function assertDateInput(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} is not a valid date`);
  }
}

function groupByPartyCurrency(rows: StatementSourceAllocationLine[]): Map<string, StatementGroup> {
  const grouped = new Map<string, StatementGroup>();

  for (const row of rows) {
    if (!row.party_id) {
      throw new Error(`Allocation line ${row.id} is missing party_id`);
    }

    const key = `${row.party_id}::${row.currency ?? "__NULL__"}`;
    const existing = grouped.get(key) ?? {
      partyId: row.party_id,
      currency: row.currency,
      rows: [],
    };
    existing.rows.push(row);
    grouped.set(key, existing);
  }

  return grouped;
}

function buildStatementLines(params: {
  statementId: string;
  rows: StatementSourceAllocationLine[];
  workTitles: Map<string, string>;
}): StatementLineInsertRow[] {
  const groups = new Map<
    string,
    { workId: string | null; currency: string | null; amount: number; rowCount: number }
  >();

  for (const row of params.rows) {
    const key = `${row.work_id ?? "__UNKNOWN__"}::${row.currency ?? "__NULL__"}`;
    const existing = groups.get(key) ?? {
      workId: row.work_id,
      currency: row.currency,
      amount: 0,
      rowCount: 0,
    };
    existing.amount = roundMoney(existing.amount + row.allocated_amount);
    existing.rowCount += 1;
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((group) => {
      const workTitle = group.workId ? params.workTitles.get(group.workId) ?? group.workId : null;
      return {
        statement_id: params.statementId,
        line_label: group.workId ? "Royalty" : "Unknown work",
        work_title: workTitle,
        row_count: group.rowCount,
        amount: roundMoney(group.amount),
        currency: group.currency,
      };
    })
    .sort((a, b) => (a.work_title ?? "").localeCompare(b.work_title ?? ""));
}

export async function generateStatements(
  params: GenerateStatementsParams
): Promise<GeneratedStatementResult> {
  if (!params.companyId) {
    throw new Error("companyId is required");
  }
  assertDateInput(params.periodStart, "periodStart");
  assertDateInput(params.periodEnd, "periodEnd");

  if (params.periodStart > params.periodEnd) {
    throw new Error("periodStart cannot be later than periodEnd");
  }

  const rows = await loadAllocationLinesForStatementGeneration({
    companyId: params.companyId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  const usable = rows.filter((row) => row.allocated_amount !== 0);

  if (!usable.length) {
    return { statementIds: [], count: 0 };
  }

  const byPartyCurrency = groupByPartyCurrency(usable);
  const generatedFrom = "allocation";

  await replaceDraftStatementsForPeriod({
    companyId: params.companyId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    generatedFrom,
  });

  const workIds = Array.from(
    new Set(usable.map((row) => row.work_id).filter((value): value is string => Boolean(value)))
  );
  const workTitles = await getWorkTitlesByIds(workIds);

  const statementIds: string[] = [];

  for (const group of byPartyCurrency.values()) {
    const partyRows = group.rows;
    const total = roundMoney(partyRows.reduce((sum, row) => sum + row.allocated_amount, 0));

    const statement = await insertStatement({
      company_id: params.companyId,
      party_id: group.partyId,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      status: "draft",
      total_amount: total,
      currency: group.currency,
      generated_from: generatedFrom,
      created_by: params.createdBy ?? null,
    });

    const statementId = statement.id;
    statementIds.push(statementId);

    const ledgerRows: StatementLedgerInsertRow[] = partyRows.map((row) => ({
      statement_id: statementId,
      allocation_row_id: row.id,
      work_id: row.work_id,
      earning_date: row.earning_date,
      amount: row.allocated_amount,
      currency: row.currency,
    }));
    await insertStatementLedgerRows(ledgerRows);

    const lines = buildStatementLines({
      statementId,
      rows: partyRows,
      workTitles,
    });
    await insertStatementLines(lines);
  }

  await createAuditEvent({
    companyId: params.companyId,
    entityType: "statement_batch",
    entityId: "generate",
    action: "statements.generated",
    payload: {
      count: statementIds.length,
      period_start: params.periodStart,
      period_end: params.periodEnd,
    },
    createdBy: params.createdBy ?? null,
  });

  return {
    statementIds,
    count: statementIds.length,
  };
}