import "server-only";

import crypto from "node:crypto";
import {
  createAllocationRun,
  failAllocationRun,
  finalizeAllocationRun,
  getImportJobForCompany,
  insertAllocationRunBlockers,
  insertAllocationRunLines,
  listImportRowsForAllocation,
  listWorkSplitsForWorkIds,
  updateImportRowsAllocationStatus,
} from "./allocations.repo";
import type {
  AllocationCandidateBlocker,
  AllocationCandidateLine,
  AllocationExecutionResult,
  ImportRowForAllocation,
  WorkSplitRecord,
} from "./allocations-types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildIdempotencyKey(
  companyId: string,
  importJobId: string,
  rowCount: number
) {
  return crypto
    .createHash("sha256")
    .update(`${companyId}:${importJobId}:${rowCount}:allocation-v2`)
    .digest("hex");
}

function groupSplitsByWorkId(splits: WorkSplitRecord[]) {
  const map = new Map<string, WorkSplitRecord[]>();

  for (const split of splits) {
    const current = map.get(split.work_id) ?? [];
    current.push(split);
    map.set(split.work_id, current);
  }

  return map;
}

function buildBlocker(params: {
  companyId: string;
  allocationRunId: string;
  importJobId: string;
  importRowId: string | null;
  blockerCode: string;
  severity: "info" | "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
}): AllocationCandidateBlocker {
  return {
    company_id: params.companyId,
    allocation_run_id: params.allocationRunId,
    import_job_id: params.importJobId,
    import_row_id: params.importRowId,
    blocker_code: params.blockerCode,
    severity: params.severity,
    message: params.message,
    details: params.details ?? {},
  };
}

function validateRowBase(
  runId: string,
  row: ImportRowForAllocation
): { blockers: AllocationCandidateBlocker[]; canAllocate: boolean } {
  const blockers: AllocationCandidateBlocker[] = [];

  if (row.amount == null) {
    blockers.push(
      buildBlocker({
        companyId: row.company_id,
        allocationRunId: runId,
        importJobId: row.import_job_id,
        importRowId: row.id,
        blockerCode: "ROW_AMOUNT_MISSING",
        severity: "error",
        message: `Import row ${row.row_number ?? "?"} saknar belopp.`,
        details: {
          row_number: row.row_number,
        },
      })
    );
  }

  if (!row.currency) {
    blockers.push(
      buildBlocker({
        companyId: row.company_id,
        allocationRunId: runId,
        importJobId: row.import_job_id,
        importRowId: row.id,
        blockerCode: "ROW_CURRENCY_MISSING",
        severity: "error",
        message: `Import row ${row.row_number ?? "?"} saknar currency.`,
        details: {
          row_number: row.row_number,
        },
      })
    );
  }

  if (!row.matched_work_id) {
    blockers.push(
      buildBlocker({
        companyId: row.company_id,
        allocationRunId: runId,
        importJobId: row.import_job_id,
        importRowId: row.id,
        blockerCode: "ROW_NOT_MATCHED_TO_WORK",
        severity: "error",
        message: `Import row ${row.row_number ?? "?"} saknar matched work.`,
        details: {
          row_number: row.row_number,
        },
      })
    );
  }

  if ((row.amount ?? 0) < 0) {
    blockers.push(
      buildBlocker({
        companyId: row.company_id,
        allocationRunId: runId,
        importJobId: row.import_job_id,
        importRowId: row.id,
        blockerCode: "NEGATIVE_ROW_AMOUNT",
        severity: "warning",
        message: `Import row ${row.row_number ?? "?"} har negativt belopp.`,
        details: {
          row_number: row.row_number,
          amount: row.amount,
        },
      })
    );
  }

  return {
    blockers,
    canAllocate: blockers.every((blocker) => blocker.severity !== "error"),
  };
}

function validateWorkSplits(
  runId: string,
  row: ImportRowForAllocation,
  splits: WorkSplitRecord[]
): { blockers: AllocationCandidateBlocker[]; valid: boolean } {
  const blockers: AllocationCandidateBlocker[] = [];

  if (splits.length === 0) {
    blockers.push(
      buildBlocker({
        companyId: row.company_id,
        allocationRunId: runId,
        importJobId: row.import_job_id,
        importRowId: row.id,
        blockerCode: "NO_ACTIVE_SPLITS_FOR_WORK",
        severity: "error",
        message: `Ingen split-konfiguration hittades för matched work på rad ${row.row_number ?? "?"}.`,
        details: {
          row_number: row.row_number,
          matched_work_id: row.matched_work_id,
        },
      })
    );

    return { blockers, valid: false };
  }

  const totalShareBps = splits.reduce((sum, split) => sum + split.share_bps, 0);

  if (totalShareBps !== 10000) {
    blockers.push(
      buildBlocker({
        companyId: row.company_id,
        allocationRunId: runId,
        importJobId: row.import_job_id,
        importRowId: row.id,
        blockerCode: "SPLITS_NOT_100_PERCENT",
        severity: "error",
        message: `Splits för work ${row.matched_work_id} summerar till ${totalShareBps / 100}% istället för 100%.`,
        details: {
          row_number: row.row_number,
          matched_work_id: row.matched_work_id,
          total_share_bps: totalShareBps,
        },
      })
    );
  }

  const duplicateKeySet = new Set<string>();
  let duplicateFound = false;

  for (const split of splits) {
    const key = `${split.party_id}:${split.role ?? ""}`;
    if (duplicateKeySet.has(key)) {
      duplicateFound = true;
      break;
    }
    duplicateKeySet.add(key);
  }

  if (duplicateFound) {
    blockers.push(
      buildBlocker({
        companyId: row.company_id,
        allocationRunId: runId,
        importJobId: row.import_job_id,
        importRowId: row.id,
        blockerCode: "DUPLICATE_SPLIT_CONFIGURATION",
        severity: "error",
        message: `Dubbel split-konfiguration hittades för work ${row.matched_work_id}.`,
        details: {
          row_number: row.row_number,
          matched_work_id: row.matched_work_id,
        },
      })
    );
  }

  return {
    blockers,
    valid: blockers.every((blocker) => blocker.severity !== "error"),
  };
}

function buildAllocationLines(
  runId: string,
  row: ImportRowForAllocation,
  splits: WorkSplitRecord[]
): AllocationCandidateLine[] {
  const rowAmount = Number(row.amount ?? 0);
  const currency = row.currency ?? null;

  const rawLines: AllocationCandidateLine[] = splits.map((split) => ({
    company_id: row.company_id,
    allocation_run_id: runId,
    import_job_id: row.import_job_id,
    import_row_id: row.id,
    work_id: row.matched_work_id,
    party_id: split.party_id,
    role: split.role ?? null,
    source_split_id: split.id,
    row_amount: rowAmount,
    share_bps: split.share_bps,
    allocated_amount: roundMoney((rowAmount * split.share_bps) / 10000),
    currency,
  }));

  const totalAllocated = rawLines.reduce(
    (sum, line) => sum + line.allocated_amount,
    0
  );
  const delta = roundMoney(rowAmount - totalAllocated);

  if (rawLines.length > 0 && delta !== 0) {
    rawLines[rawLines.length - 1] = {
      ...rawLines[rawLines.length - 1]!,
      allocated_amount: roundMoney(
        rawLines[rawLines.length - 1]!.allocated_amount + delta
      ),
    };
  }

  return rawLines;
}

export async function runAllocationForImportJob(params: {
  companyId: string;
  importJobId: string;
  createdBy?: string | null;
}): Promise<AllocationExecutionResult> {
  const importJob = await getImportJobForCompany(
    params.companyId,
    params.importJobId
  );

  if (!importJob) {
    throw new Error("Import job not found for company.");
  }

  const rows = await listImportRowsForAllocation(
    params.companyId,
    params.importJobId
  );

  const distinctCurrencies = [
    ...new Set(
      rows
        .map((row) => row.currency)
        .filter((value): value is string => Boolean(value))
    ),
  ];

  const run = await createAllocationRun({
    companyId: params.companyId,
    importJobId: params.importJobId,
    currency: distinctCurrencies.length === 1 ? distinctCurrencies[0] : null,
    createdBy: params.createdBy ?? null,
    idempotencyKey: buildIdempotencyKey(
      params.companyId,
      params.importJobId,
      rows.length
    ),
  });

  try {
    const workIds = [
      ...new Set(
        rows
          .map((row) => row.matched_work_id)
          .filter((value): value is string => Boolean(value))
      ),
    ];

    const allSplits = await listWorkSplitsForWorkIds(params.companyId, workIds);
    const splitsByWorkId = groupSplitsByWorkId(allSplits);

    const lines: AllocationCandidateLine[] = [];
    const blockers: AllocationCandidateBlocker[] = [];

    let grossAmount = 0;
    let allocatedAmount = 0;
    let allocatedRowCount = 0;

    for (const row of rows) {
      if (row.amount != null) {
        grossAmount += Number(row.amount);
      }

      const baseValidation = validateRowBase(run.id, row);
      blockers.push(...baseValidation.blockers);

      if (!baseValidation.canAllocate) {
        continue;
      }

      const workSplits = splitsByWorkId.get(String(row.matched_work_id)) ?? [];
      const splitValidation = validateWorkSplits(run.id, row, workSplits);
      blockers.push(...splitValidation.blockers);

      if (!splitValidation.valid) {
        continue;
      }

      const rowLines = buildAllocationLines(run.id, row, workSplits);
      lines.push(...rowLines);

      allocatedRowCount += 1;
      allocatedAmount += rowLines.reduce(
        (sum, line) => sum + line.allocated_amount,
        0
      );
    }

    await insertAllocationRunLines(lines);
    await insertAllocationRunBlockers(blockers);

    const grossRounded = roundMoney(grossAmount);
    const allocatedRounded = roundMoney(allocatedAmount);
    const unallocatedRounded = roundMoney(grossRounded - allocatedRounded);

    await finalizeAllocationRun({
      allocationRunId: run.id,
      lineCount: lines.length,
      totalSourceAmount: grossRounded,
      totalAllocatedAmount: allocatedRounded,
      inputRowCount: rows.length,
      allocatedRowCount,
      blockerCount: blockers.length,
      unallocatedAmount: unallocatedRounded,
      engineVersion: "v2",
    });

    await updateImportRowsAllocationStatus(params.importJobId, "completed");

    return {
      runId: run.id,
      status: "completed",
      inputRowCount: rows.length,
      allocatedRowCount,
      blockerCount: blockers.length,
      grossAmount: grossRounded,
      allocatedAmount: allocatedRounded,
      unallocatedAmount: unallocatedRounded,
      currency: distinctCurrencies.length === 1 ? distinctCurrencies[0] : null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown allocation error";

    await failAllocationRun({
      allocationRunId: run.id,
      errorMessage: message,
    });

    await updateImportRowsAllocationStatus(params.importJobId, "failed");

    throw error;
  }
}