import "server-only";

import { calculateAllocationLines } from "./calculate-allocation-lines";
import { assertImportJobReadyForAllocation } from "./assert-import-job-ready-for-allocation";
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
import { AllocationLineInsert, AllocationRunResult } from "./allocation-types";

function pickAmount(row: {
  net_amount: number | null;
  gross_amount: number | null;
}): { amount: number; amountType: "net" | "gross" } {
  if (typeof row.net_amount === "number") {
    return { amount: row.net_amount, amountType: "net" };
  }

  if (typeof row.gross_amount === "number") {
    return { amount: row.gross_amount, amountType: "gross" };
  }

  throw new Error("Matched row is missing both net_amount and gross_amount");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function runAllocation(importJobId: string): Promise<AllocationRunResult> {
  await assertImportJobReadyForAllocation(importJobId);

  const importJob = await getImportJobCompany(importJobId);
  await setImportJobStatus(importJobId, "allocating");

  const matchedRows = await getMatchedRowsForAllocation(importJobId);

  if (matchedRows.length === 0) {
    throw new Error("No matched rows found for allocation");
  }

  const currency = matchedRows[0]?.currency ?? null;
  const allocationRun = await createAllocationRun({
    companyId: importJob.company_id,
    importJobId,
    currency,
  });

  try {
    const workIds = [...new Set(matchedRows.map((row) => row.matched_work_id))];
    const splitRecords = await getWorkSplitsForWorks({
      companyId: importJob.company_id,
      workIds,
    });

    const splitMap = new Map<string, Array<{ partyId: string; splitPercent: number }>>();

    for (const split of splitRecords) {
      const existing = splitMap.get(split.work_id) ?? [];
      existing.push({
        partyId: split.party_id,
        splitPercent: Number(split.share_percent),
      });
      splitMap.set(split.work_id, existing);
    }

    const allocationLines: AllocationLineInsert[] = [];
    const allocatedRowIds: string[] = [];

    let totalNetAmount = 0;
    let totalGrossAmount = 0;
    let blockedRows = 0;

    for (const row of matchedRows) {
      const splits = splitMap.get(row.matched_work_id) ?? [];

      if (splits.length === 0) {
        blockedRows += 1;
        continue;
      }

      const splitSum = splits.reduce((sum, split) => sum + split.splitPercent, 0);
      if (Math.abs(splitSum - 100) > 0.0001) {
        blockedRows += 1;
        continue;
      }

      if (!row.currency) {
        blockedRows += 1;
        continue;
      }

      const { amount, amountType } = pickAmount(row);

      const lines = calculateAllocationLines({
        sourceAmount: amount,
        splits,
      });

      for (const line of lines) {
        allocationLines.push({
          company_id: row.company_id,
          allocation_run_id: allocationRun.id,
          import_job_id: row.import_job_id,
          import_row_id: row.id,
          work_id: row.matched_work_id,
          party_id: line.partyId,
          currency: row.currency,
          source_amount: amount,
          allocated_amount: roundMoney(line.allocatedAmount),
          split_percent: line.splitPercent,
          amount_type: amountType,
        });
      }

      allocatedRowIds.push(row.id);

      if (typeof row.net_amount === "number") {
        totalNetAmount += row.net_amount;
      }

      if (typeof row.gross_amount === "number") {
        totalGrossAmount += row.gross_amount;
      }
    }

    await insertAllocationLines(allocationLines);
    await markRowsAllocated({ importRowIds: allocatedRowIds });

    await setAllocationRunStatus({
      allocationRunId: allocationRun.id,
      status: "completed",
      totals: {
        total_rows: matchedRows.length,
        allocated_rows: allocatedRowIds.length,
        blocked_rows: blockedRows,
        total_net_amount: roundMoney(totalNetAmount),
        total_gross_amount: roundMoney(totalGrossAmount),
      },
    });

    await setImportJobStatus(importJobId, "allocated");

    return {
      allocationRunId: allocationRun.id,
      totalRows: matchedRows.length,
      allocatedRows: allocatedRowIds.length,
      blockedRows,
      totalNetAmount: roundMoney(totalNetAmount),
      totalGrossAmount: roundMoney(totalGrossAmount),
    };
  } catch (error) {
    await setAllocationRunStatus({
      allocationRunId: allocationRun.id,
      status: "failed",
    });

    await setImportJobStatus(importJobId, "matched");
    throw error;
  }
}