import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildStableHash,
  computeAllocationRunSummary,
  createAllocationRun,
  insertAllocationBlocker,
  insertAllocationCandidate,
  insertAllocationLines,
  loadImportRowsForAllocation,
  loadSplitsForWorks,
  setAllocationRunCompleted,
  setAllocationRunFailed,
  updateAllocationCandidateStatus,
} from "./allocations.repo";
import type {
  AllocationLineInsert,
  AllocationRunResult,
  ImportRowForAllocation,
  SplitForAllocation,
} from "./allocations-types";

const AMOUNT_SCALE = 1_000_000;
const SPLIT_SUM_EPSILON = 0.000001;

function toAmountMicros(value: number): number {
  return Math.round(value * AMOUNT_SCALE);
}

function fromAmountMicros(value: number): number {
  return value / AMOUNT_SCALE;
}

function normalizeCurrency(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function groupSplitsByWorkId(splits: SplitForAllocation[]) {
  const map = new Map<string, SplitForAllocation[]>();

  for (const split of splits) {
    const existing = map.get(split.work_id) ?? [];
    existing.push(split);
    map.set(split.work_id, existing);
  }

  for (const [workId, items] of map.entries()) {
    items.sort((a, b) => {
      const aCreatedAt = a.created_at ?? "";
      const bCreatedAt = b.created_at ?? "";
      if (aCreatedAt !== bCreatedAt) {
        return aCreatedAt.localeCompare(bCreatedAt);
      }

      const aValidFrom = a.valid_from ?? "";
      const bValidFrom = b.valid_from ?? "";
      if (aValidFrom !== bValidFrom) {
        return aValidFrom.localeCompare(bValidFrom);
      }

      return a.id.localeCompare(b.id);
    });

    map.set(workId, items);
  }

  return map;
}

function validateSplits(splits: SplitForAllocation[]): {
  ok: boolean;
  blockerCode?: "missing_splits" | "missing_party" | "split_sum_not_100";
  blockerMessage?: string;
} {
  if (splits.length === 0) {
    return {
      ok: false,
      blockerCode: "missing_splits",
      blockerMessage: "No work_splits found for matched work.",
    };
  }

  for (const split of splits) {
    if (!split.party_id) {
      return {
        ok: false,
        blockerCode: "missing_party",
        blockerMessage: `Split ${split.id} is missing party_id.`,
      };
    }

    if (!isFiniteNumber(split.share_fraction) || split.share_fraction <= 0) {
      return {
        ok: false,
        blockerCode: "split_sum_not_100",
        blockerMessage: `Split ${split.id} has invalid share_fraction.`,
      };
    }
  }

  const shareSum = splits.reduce(
    (sum, split) => sum + split.share_fraction,
    0,
  );

  if (Math.abs(shareSum - 1) > SPLIT_SUM_EPSILON) {
    return {
      ok: false,
      blockerCode: "split_sum_not_100",
      blockerMessage: `Split sum must equal 1.0. Current sum: ${shareSum}.`,
    };
  }

  return { ok: true };
}

function allocateNetAcrossSplits(params: {
  row: ImportRowForAllocation;
  splits: SplitForAllocation[];
  allocationRunId: string;
}): AllocationLineInsert[] {
  const rowNet = Number(params.row.net_amount ?? 0);
  const rowGross = Number(params.row.gross_amount ?? 0);
  const totalMicros = toAmountMicros(rowNet);

  const splitWeights = params.splits.map((split, index) => {
    const raw = totalMicros * split.share_fraction;
    const floored = Math.floor(raw);
    const remainder = raw - floored;

    return {
      split,
      index,
      floored,
      remainder,
      shareFraction: split.share_fraction,
    };
  });

  let allocatedMicros = splitWeights.reduce((sum, item) => sum + item.floored, 0);
  let leftover = totalMicros - allocatedMicros;

  splitWeights.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.index - b.index;
  });

  for (let i = 0; i < splitWeights.length && leftover > 0; i += 1) {
    splitWeights[i].floored += 1;
    leftover -= 1;
  }

  splitWeights.sort((a, b) => a.index - b.index);

  const createdAt = new Date().toISOString();

  return splitWeights.map((item) => ({
    allocation_run_id: params.allocationRunId,
    import_row_id: params.row.id,
    work_id: params.row.work_id as string,
    party_id: item.split.party_id as string,
    split_id: item.split.id,
    share_fraction: item.shareFraction,
    gross_source_amount: rowGross,
    net_source_amount: rowNet,
    allocated_amount: fromAmountMicros(item.floored),
    currency: normalizeCurrency(params.row.currency),
    line_type: "primary",
    calc_trace: {
      engine: "allocation-v2",
      row_id: params.row.id,
      work_id: params.row.work_id,
      row_net_amount: rowNet,
      share_fraction: item.shareFraction,
      allocated_amount_micros: item.floored,
      hash: buildStableHash({
        rowId: params.row.id,
        splitId: item.split.id,
        rowNet,
        shareFraction: item.shareFraction,
      }),
    },
    created_at: createdAt,
  }));
}

async function markImportRowsAllocated(importRowIds: string[]): Promise<void> {
  if (importRowIds.length === 0) return;

  const { error } = await supabaseAdmin
    .from("import_rows")
    .update({
      allocation_status: "allocated",
      updated_at: new Date().toISOString(),
    })
    .in("id", importRowIds);

  if (error) {
    throw new Error(`markImportRowsAllocated failed: ${error.message}`);
  }
}

async function markImportRowsBlocked(importRowIds: string[]): Promise<void> {
  if (importRowIds.length === 0) return;

  const { error } = await supabaseAdmin
    .from("import_rows")
    .update({
      allocation_status: "blocked",
      updated_at: new Date().toISOString(),
    })
    .in("id", importRowIds);

  if (error) {
    throw new Error(`markImportRowsBlocked failed: ${error.message}`);
  }
}

export async function runAllocationForImportJob(params: {
  companyId: string;
  importJobId: string;
  createdBy?: string | null;
  currency?: string | null;
}): Promise<AllocationRunResult> {
  const rows = await loadImportRowsForAllocation({
    companyId: params.companyId,
    importJobId: params.importJobId,
  });

  const workIds = [...new Set(rows.map((row) => row.work_id).filter(Boolean))] as string[];

  const splits = await loadSplitsForWorks({
    companyId: params.companyId,
    workIds,
  });

  const splitsByWorkId = groupSplitsByWorkId(splits);

  const currency =
    params.currency ??
    normalizeCurrency(
      rows.find((row) => normalizeCurrency(row.currency))?.currency ?? null,
    );

  const allocationRun = await createAllocationRun({
    companyId: params.companyId,
    importJobId: params.importJobId,
    currency,
    createdBy: params.createdBy ?? null,
    inputHash: buildStableHash({
      companyId: params.companyId,
      importJobId: params.importJobId,
      rowIds: rows.map((row) => row.id).sort(),
    }),
  });

  const allocatedRowIds: string[] = [];
  const blockedRowIds: string[] = [];

  try {
    for (const row of rows) {
      const candidate = await insertAllocationCandidate({
        company_id: params.companyId,
        allocation_run_id: allocationRun.id,
        import_job_id: params.importJobId,
        import_row_id: row.id,
        work_id: row.work_id,
        status: "pending",
        currency: normalizeCurrency(row.currency),
        gross_amount: row.gross_amount ?? 0,
        net_amount: row.net_amount ?? 0,
        created_at: new Date().toISOString(),
      });

      if (!row.work_id) {
        await updateAllocationCandidateStatus({
          allocationCandidateId: candidate.id,
          status: "blocked",
          blockerCode: "missing_work_match",
          blockerMessage: "Import row has no matched work.",
        });

        await insertAllocationBlocker({
          companyId: params.companyId,
          allocationRunId: allocationRun.id,
          allocationCandidateId: candidate.id,
          importRowId: row.id,
          workId: null,
          blockerCode: "missing_work_match",
          message: "Import row has no matched work.",
        });

        blockedRowIds.push(row.id);
        continue;
      }

      const rowCurrency = normalizeCurrency(row.currency);
      if (!rowCurrency) {
        await updateAllocationCandidateStatus({
          allocationCandidateId: candidate.id,
          status: "blocked",
          blockerCode: "currency_missing",
          blockerMessage: "Import row currency is missing.",
        });

        await insertAllocationBlocker({
          companyId: params.companyId,
          allocationRunId: allocationRun.id,
          allocationCandidateId: candidate.id,
          importRowId: row.id,
          workId: row.work_id,
          blockerCode: "currency_missing",
          message: "Import row currency is missing.",
        });

        blockedRowIds.push(row.id);
        continue;
      }

      if (!isFiniteNumber(row.net_amount) || !isFiniteNumber(row.gross_amount)) {
        await updateAllocationCandidateStatus({
          allocationCandidateId: candidate.id,
          status: "blocked",
          blockerCode: "amount_missing",
          blockerMessage: "Import row gross_amount or net_amount is missing.",
        });

        await insertAllocationBlocker({
          companyId: params.companyId,
          allocationRunId: allocationRun.id,
          allocationCandidateId: candidate.id,
          importRowId: row.id,
          workId: row.work_id,
          blockerCode: "amount_missing",
          message: "Import row gross_amount or net_amount is missing.",
        });

        blockedRowIds.push(row.id);
        continue;
      }

      const rowSplits = splitsByWorkId.get(row.work_id) ?? [];
      const validation = validateSplits(rowSplits);

      if (!validation.ok) {
        await updateAllocationCandidateStatus({
          allocationCandidateId: candidate.id,
          status: "blocked",
          blockerCode: validation.blockerCode ?? "missing_splits",
          blockerMessage:
            validation.blockerMessage ?? "Invalid split configuration.",
        });

        await insertAllocationBlocker({
          companyId: params.companyId,
          allocationRunId: allocationRun.id,
          allocationCandidateId: candidate.id,
          importRowId: row.id,
          workId: row.work_id,
          blockerCode: validation.blockerCode ?? "missing_splits",
          message:
            validation.blockerMessage ?? "Invalid split configuration.",
          details: {
            work_id: row.work_id,
            split_count: rowSplits.length,
            share_sum: rowSplits.reduce(
              (sum, split) => sum + split.share_fraction,
              0,
            ),
          },
        });

        blockedRowIds.push(row.id);
        continue;
      }

      await updateAllocationCandidateStatus({
        allocationCandidateId: candidate.id,
        status: "eligible",
      });

      const lines = allocateNetAcrossSplits({
        row,
        splits: rowSplits,
        allocationRunId: allocationRun.id,
      });

      await insertAllocationLines(lines);

      await updateAllocationCandidateStatus({
        allocationCandidateId: candidate.id,
        status: "allocated",
      });

      allocatedRowIds.push(row.id);
    }

    await markImportRowsAllocated(allocatedRowIds);
    await markImportRowsBlocked(blockedRowIds);

    const summary = await computeAllocationRunSummary({
      allocationRunId: allocationRun.id,
      companyId: params.companyId,
      importJobId: params.importJobId,
    });

    await setAllocationRunCompleted({
      allocationRunId: allocationRun.id,
      summary,
    });

    return {
      runId: allocationRun.id,
      inputRowCount: summary.inputRowCount,
      allocatedRowCount: summary.allocatedRowCount,
      blockerCount: summary.blockerCount,
      grossAmount: summary.grossAmountTotal,
      allocatedAmount: summary.allocatedAmountTotal,
      unallocatedAmount: summary.unallocatedAmountTotal,
      currency,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown allocation failure";

    await setAllocationRunFailed({
      allocationRunId: allocationRun.id,
      message,
    });

    throw error;
  }
}