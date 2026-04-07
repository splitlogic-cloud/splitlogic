import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildStableHash,
  computeAllocationRunSummary,
  createAllocationRun,
  insertAllocationBlocker,
  insertAllocationCandidate,
  insertAllocationCandidates,
  insertAllocationLines,
  loadImportRowsForAllocation,
  loadSplitsForWorks,
  setAllocationRunCompleted,
  setAllocationRunFailed,
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

async function loadDefaultCompanyPartyId(companyId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("parties")
    .select("id, type, name")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load company fallback party: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    type: string | null;
    name: string | null;
  }>;

  const explicitCompanyParty = rows.find((row) => {
    const t = String(row.type ?? "").toLowerCase();
    return t === "company" || t === "bolag";
  });

  if (explicitCompanyParty) {
    return explicitCompanyParty.id;
  }

  return rows[0]?.id ?? null;
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
    company_id: params.row.company_id,
    import_job_id: params.row.import_job_id,
    allocation_run_id: params.allocationRunId,
    import_row_id: params.row.id,
    work_id: params.row.work_id as string,
    party_id: item.split.party_id as string,
    source_split_id:
      item.split.role === "company_fallback" ? null : item.split.id,
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
  const chunkSize = 500;
  for (let i = 0; i < importRowIds.length; i += chunkSize) {
    const chunk = importRowIds.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin
      .from("import_rows")
      .update({
        allocation_status: "allocated",
        updated_at: new Date().toISOString(),
      })
      .in("id", chunk);

    if (error) {
      throw new Error(`markImportRowsAllocated failed: ${error.message}`);
    }
  }
}

async function markImportRowsBlocked(importRowIds: string[]): Promise<void> {
  if (importRowIds.length === 0) return;
  const chunkSize = 500;
  for (let i = 0; i < importRowIds.length; i += chunkSize) {
    const chunk = importRowIds.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin
      .from("import_rows")
      .update({
        // import_rows.allocation_status does not accept "blocked" in this schema.
        // Keep rows pending while blocker details live in allocation_blockers.
        allocation_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .in("id", chunk);

    if (error) {
      throw new Error(`markImportRowsBlocked failed: ${error.message}`);
    }
  }
}

export async function runAllocationForImportJob(params: {
  companyId: string;
  importJobId: string;
  createdBy?: string | null;
  currency?: string | null;
}): Promise<AllocationRunResult> {
  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", params.importJobId)
    .maybeSingle();

  if (importJobError || !importJob) {
    throw new Error(
      `Import job not found for allocation: ${importJobError?.message ?? ""}`.trim(),
    );
  }

  if (importJob.company_id !== params.companyId) {
    throw new Error(
      "Import job does not belong to the provided company. Allocation aborted.",
    );
  }

  const rows = await loadImportRowsForAllocation({
    companyId: params.companyId,
    importJobId: params.importJobId,
  });

  const workIds = [...new Set(rows.map((row) => row.work_id).filter(Boolean))] as string[];

  const splits = await loadSplitsForWorks({
    companyId: params.companyId,
    workIds,
  });
  const defaultCompanyPartyId = await loadDefaultCompanyPartyId(params.companyId);

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
  const allocationLinesToInsert: AllocationLineInsert[] = [];
  const allocationCandidatesToInsert: Record<string, unknown>[] = [];

  try {
    for (const row of rows) {
      if (!row.work_id) {
        const candidate = await insertAllocationCandidate({
          company_id: params.companyId,
          allocation_run_id: allocationRun.id,
          import_job_id: params.importJobId,
          import_row_id: row.id,
          work_id: row.work_id,
          status: "blocked",
          blocker_code: "missing_work_match",
          blocker_message: "Import row has no matched work.",
          currency: normalizeCurrency(row.currency),
          gross_amount: row.gross_amount ?? 0,
          net_amount: row.net_amount ?? 0,
          created_at: new Date().toISOString(),
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
        const candidate = await insertAllocationCandidate({
          company_id: params.companyId,
          allocation_run_id: allocationRun.id,
          import_job_id: params.importJobId,
          import_row_id: row.id,
          work_id: row.work_id,
          status: "blocked",
          blocker_code: "currency_missing",
          blocker_message: "Import row currency is missing.",
          currency: normalizeCurrency(row.currency),
          gross_amount: row.gross_amount ?? 0,
          net_amount: row.net_amount ?? 0,
          created_at: new Date().toISOString(),
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
        const candidate = await insertAllocationCandidate({
          company_id: params.companyId,
          allocation_run_id: allocationRun.id,
          import_job_id: params.importJobId,
          import_row_id: row.id,
          work_id: row.work_id,
          status: "blocked",
          blocker_code: "amount_missing",
          blocker_message: "Import row gross_amount or net_amount is missing.",
          currency: normalizeCurrency(row.currency),
          gross_amount: row.gross_amount ?? 0,
          net_amount: row.net_amount ?? 0,
          created_at: new Date().toISOString(),
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

      let rowSplits = splitsByWorkId.get(row.work_id) ?? [];
      if (rowSplits.length === 0 && defaultCompanyPartyId) {
        rowSplits = [
          {
            id: `default-company-party-${defaultCompanyPartyId}`,
            company_id: params.companyId,
            work_id: row.work_id,
            party_id: defaultCompanyPartyId,
            share_fraction: 1,
            role: "company_fallback",
            valid_from: null,
            valid_to: null,
            created_at: null,
          } as SplitForAllocation,
        ];
      }
      const validation = validateSplits(rowSplits);

      if (!validation.ok) {
        const candidate = await insertAllocationCandidate({
          company_id: params.companyId,
          allocation_run_id: allocationRun.id,
          import_job_id: params.importJobId,
          import_row_id: row.id,
          work_id: row.work_id,
          status: "blocked",
          blocker_code: validation.blockerCode ?? "missing_splits",
          blocker_message:
            validation.blockerMessage ?? "Invalid split configuration.",
          currency: normalizeCurrency(row.currency),
          gross_amount: row.gross_amount ?? 0,
          net_amount: row.net_amount ?? 0,
          created_at: new Date().toISOString(),
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

      allocationCandidatesToInsert.push({
        company_id: params.companyId,
        allocation_run_id: allocationRun.id,
        import_job_id: params.importJobId,
        import_row_id: row.id,
        work_id: row.work_id,
        status: "allocated",
        currency: normalizeCurrency(row.currency),
        gross_amount: row.gross_amount ?? 0,
        net_amount: row.net_amount ?? 0,
        created_at: new Date().toISOString(),
      });

      const lines = allocateNetAcrossSplits({
        row,
        splits: rowSplits,
        allocationRunId: allocationRun.id,
      });

      allocationLinesToInsert.push(...lines);

      allocatedRowIds.push(row.id);
    }

    await insertAllocationCandidates(allocationCandidatesToInsert);
    await insertAllocationLines(allocationLinesToInsert);
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