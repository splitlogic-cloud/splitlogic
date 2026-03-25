import "server-only";

import {
  createAllocationRun,
  getImportJobCompany,
  getMatchedRowsForAllocation,
  getWorkSplitsForWorks,
  insertAllocationLines,
  markRowsAllocated,
  setAllocationRunStatus,
  setImportJobStatus,
} from "./allocations.repo";
import type {
  AllocationLineInsert,
  AllocationRunResult,
} from "./allocations-types";

function toAmount(row: {
  net_amount: number | null;
  gross_amount: number | null;
}): number {
  if (row.net_amount != null) return Number(row.net_amount);
  if (row.gross_amount != null) return Number(row.gross_amount);
  return 0;
}

function normalizeShareBps(split: {
  share_bps?: number | null;
  share_percent?: number | null;
}): number {
  if (typeof split.share_bps === "number") return split.share_bps;
  if (typeof split.share_percent === "number") return Math.round(split.share_percent * 100);
  return 0;
}

export async function runAllocation(importJobId: string): Promise<AllocationRunResult> {
  const importJob = await getImportJobCompany(importJobId);

  await setImportJobStatus(importJobId, "allocating");

  const matchedRows = await getMatchedRowsForAllocation(importJobId);

  const currency =
    matchedRows.length > 0
      ? matchedRows.map((row) => row.currency).find((value) => Boolean(value)) ?? null
      : null;

  const run = await createAllocationRun({
    companyId: importJob.company_id,
    importJobId,
    currency,
  });

  try {
    const workIds = [
      ...new Set(
        matchedRows.map((row) => row.matched_work_id).filter(Boolean)
      ),
    ] as string[];

    const splits = await getWorkSplitsForWorks({
      companyId: importJob.company_id,
      workIds,
    });

    const splitsByWorkId = new Map<string, typeof splits>();

    for (const split of splits) {
      const current = splitsByWorkId.get(split.work_id) ?? [];
      current.push(split);
      splitsByWorkId.set(split.work_id, current);
    }

    const lines: AllocationLineInsert[] = [];
    const allocatedImportRowIds: string[] = [];

    let totalRows = 0;
    let allocatedRows = 0;
    let blockedRows = 0;
    let totalNetAmount = 0;
    let totalGrossAmount = 0;

    for (const row of matchedRows) {
      totalRows += 1;

      const amount = toAmount(row);
      totalNetAmount += row.net_amount ?? 0;
      totalGrossAmount += row.gross_amount ?? row.net_amount ?? 0;

      if (!row.matched_work_id) {
        blockedRows += 1;
        continue;
      }

      const workSplits = splitsByWorkId.get(row.matched_work_id) ?? [];

      if (workSplits.length === 0) {
        blockedRows += 1;
        continue;
      }

      const totalShareBps = workSplits.reduce(
        (sum, split) => sum + normalizeShareBps(split),
        0
      );

      if (totalShareBps <= 0) {
        blockedRows += 1;
        continue;
      }

      let allocatedSoFar = 0;

      workSplits.forEach((split, index) => {
        const shareBps = normalizeShareBps(split);

        const allocatedAmount =
          index === workSplits.length - 1
            ? Math.round((amount - allocatedSoFar) * 100) / 100
            : Math.round(((amount * shareBps) / 10000) * 100) / 100;

        allocatedSoFar += allocatedAmount;

        lines.push({
          allocation_run_id: run.id,
          company_id: row.company_id,
          import_job_id: row.import_job_id,
          import_row_id: row.id,
          work_id: row.matched_work_id,
          party_id: split.party_id,
          role: split.role ?? null,
          source_split_id: split.id,
          row_amount: amount,
          share_bps: shareBps,
          allocated_amount: allocatedAmount,
          currency: row.currency ?? null,
          metadata: null,
        });
      });

      allocatedRows += 1;
      allocatedImportRowIds.push(row.id);
    }

    await insertAllocationLines(lines);

    await markRowsAllocated({
      importRowIds: allocatedImportRowIds,
    });

    await setImportJobStatus(importJobId, "completed");

    await setAllocationRunStatus({
      allocationRunId: run.id,
      status: "completed",
      totals: {
        total_rows: totalRows,
        allocated_rows: allocatedRows,
        blocked_rows: blockedRows,
        total_net_amount: Math.round(totalNetAmount * 100) / 100,
        total_gross_amount: Math.round(totalGrossAmount * 100) / 100,
      },
    });

    return {
      id: run.id,
      status: "completed",
    };
  } catch (error) {
    try {
      await setImportJobStatus(importJobId, "failed");
    } catch (importJobStatusError) {
      console.error("[runAllocation] failed to set import job status to failed", {
        importJobId,
        importJobStatusError,
      });
    }

    try {
      await setAllocationRunStatus({
        allocationRunId: run.id,
        status: "failed",
      });
    } catch (allocationRunStatusError) {
      console.error("[runAllocation] failed to set allocation run status to failed", {
        allocationRunId: run.id,
        allocationRunStatusError,
      });
    }

    throw error;
  }
}