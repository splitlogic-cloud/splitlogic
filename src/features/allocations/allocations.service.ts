import "server-only";

import { ALLOCATION_TOLERANCE } from "./allocations.constants";
import {
  insertAllocationBlocker,
  insertAllocationCandidate,
  insertAllocationLines,
  loadImportRowsForAllocation,
  loadSplitsForWorks,
  createAllocationRun,
  setAllocationRunCompleted,
  setAllocationRunFailed,
  updateAllocationCandidateStatus,
  buildStableHash,
  computeAllocationRunSummary,
} from "./allocations.repo";
import {
  buildNormalizedRowSnapshot,
  buildRawRowSnapshot,
  buildSplitSnapshot,
  buildWorkSnapshot,
} from "./allocations.snapshot";
import { validateAllocationCandidate } from "./allocations.validation";
import type {
  AllocationLineInsert,
  ImportRowForAllocation,
  SplitForAllocation,
} from "./allocations-types";

function groupSplitsByWorkId(splits: SplitForAllocation[]): Map<string, SplitForAllocation[]> {
  const map = new Map<string, SplitForAllocation[]>();

  for (const split of splits) {
    const existing = map.get(split.work_id) ?? [];
    existing.push(split);
    map.set(split.work_id, existing);
  }

  return map;
}

function buildIdempotencyKey(params: {
  companyId: string;
  importJobId: string;
}): string {
  return `allocation:${params.companyId}:${params.importJobId}`;
}

function buildInputHash(rows: ImportRowForAllocation[]): string {
  const stableInput = rows
    .map((row) => ({
      id: row.id,
      workId: row.work_id,
      currency: row.currency,
      grossAmount: row.gross_amount,
      netAmount: row.net_amount,
      title: row.title ?? null,
      artist: row.artist ?? null,
      isrc: row.isrc ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return buildStableHash(stableInput);
}

function assertLineSumMatches(params: {
  netAmount: number;
  lineAmountTotal: number;
}): void {
  if (Math.abs(params.netAmount - params.lineAmountTotal) > ALLOCATION_TOLERANCE) {
    throw new Error(
      `line_sum_mismatch: expected=${params.netAmount}, actual=${params.lineAmountTotal}`,
    );
  }
}

export async function runAllocationForImportJob(params: {
  companyId: string;
  importJobId: string;
  currency?: string | null;
  createdBy?: string | null;
}): Promise<{ allocationRunId: string }> {
  const rows = await loadImportRowsForAllocation({
    companyId: params.companyId,
    importJobId: params.importJobId,
  });

  const inputHash = buildInputHash(rows);

  const { id: allocationRunId } = await createAllocationRun({
    companyId: params.companyId,
    importJobId: params.importJobId,
    currency: params.currency ?? null,
    createdBy: params.createdBy ?? null,
    idempotencyKey: buildIdempotencyKey({
      companyId: params.companyId,
      importJobId: params.importJobId,
    }),
    inputHash,
  });

  try {
    const workIds = [...new Set(rows.map((row) => row.work_id).filter(Boolean) as string[])];
    const splits = await loadSplitsForWorks({
      companyId: params.companyId,
      workIds,
    });

    const splitsByWorkId = groupSplitsByWorkId(splits);

    for (const row of rows) {
      const rowSplits = row.work_id ? splitsByWorkId.get(row.work_id) ?? [] : [];

      const rawRowSnapshot = buildRawRowSnapshot(row);
      const normalizedRowSnapshot = buildNormalizedRowSnapshot(row);
      const workSnapshot = buildWorkSnapshot(row);
      const splitSnapshot = buildSplitSnapshot(rowSplits);

      const candidateHash = buildStableHash({
        importRowId: row.id,
        workId: row.work_id,
        currency: row.currency,
        grossAmount: row.gross_amount,
        netAmount: row.net_amount,
        splitSnapshot,
      });

      const { id: allocationCandidateId } = await insertAllocationCandidate({
        company_id: params.companyId,
        allocation_run_id: allocationRunId,
        import_job_id: params.importJobId,
        import_row_id: row.id,
        work_id: row.work_id,
        status: "pending",
        currency: row.currency,
        gross_amount: row.gross_amount,
        net_amount: row.net_amount,
        raw_row_snapshot: rawRowSnapshot,
        normalized_row_snapshot: normalizedRowSnapshot,
        work_snapshot: workSnapshot,
        split_snapshot: splitSnapshot,
        candidate_hash: candidateHash,
      });

      const validation = validateAllocationCandidate({
        row,
        splits: rowSplits,
      });

      if (!validation.ok) {
        await updateAllocationCandidateStatus({
          allocationCandidateId,
          status: "blocked",
          blockerCode: validation.blockerCode,
          blockerMessage: validation.message,
        });

        await insertAllocationBlocker({
          companyId: params.companyId,
          allocationRunId,
          allocationCandidateId,
          importRowId: row.id,
          workId: row.work_id,
          blockerCode: validation.blockerCode,
          message: validation.message,
          details: validation.details ?? {},
        });

        continue;
      }

      await updateAllocationCandidateStatus({
        allocationCandidateId,
        status: "eligible",
      });

      const netAmount = Number(row.net_amount ?? 0);
      const grossAmount = Number(row.gross_amount ?? 0);
      const currency = row.currency as string;
      const workId = row.work_id as string;

      const allocationLines: AllocationLineInsert[] = rowSplits.map((split) => {
        const shareFraction = Number(split.share_fraction ?? 0);
        const allocatedAmount = netAmount * shareFraction;

        return {
          company_id: params.companyId,
          allocation_run_id: allocationRunId,
          allocation_candidate_id: allocationCandidateId,
          import_job_id: params.importJobId,
          import_row_id: row.id,
          work_id: workId,
          party_id: split.party_id as string,
          source_split_id: split.id,
          split_snapshot: {
            splitId: split.id,
            partyId: split.party_id,
            shareFraction,
            role: split.role ?? null,
            validFrom: split.valid_from ?? null,
            validTo: split.valid_to ?? null,
          },
          gross_source_amount: grossAmount,
          net_source_amount: netAmount,
          share_fraction: shareFraction,
          allocated_amount: allocatedAmount,
          currency,
          line_type: "royalty_share",
          calc_trace: {
            method: "net_amount_x_share_fraction",
            engineVersion: "v1",
            rulesVersion: "v1",
          },
        };
      });

      const lineAmountTotal = allocationLines.reduce(
        (sum, line) => sum + line.allocated_amount,
        0,
      );

      try {
        assertLineSumMatches({
          netAmount,
          lineAmountTotal,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "line_sum_mismatch during allocation";

        await updateAllocationCandidateStatus({
          allocationCandidateId,
          status: "blocked",
          blockerCode: "line_sum_mismatch",
          blockerMessage: message,
        });

        await insertAllocationBlocker({
          companyId: params.companyId,
          allocationRunId,
          allocationCandidateId,
          importRowId: row.id,
          workId,
          blockerCode: "line_sum_mismatch",
          message,
          details: {
            expectedNetAmount: netAmount,
            actualAllocatedTotal: lineAmountTotal,
          },
        });

        continue;
      }

      await insertAllocationLines(allocationLines);

      await updateAllocationCandidateStatus({
        allocationCandidateId,
        status: "allocated",
      });
    }

    const summary = await computeAllocationRunSummary({
      allocationRunId,
      companyId: params.companyId,
      importJobId: params.importJobId,
    });

    await setAllocationRunCompleted({
      allocationRunId,
      summary,
    });

    return { allocationRunId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown allocation engine failure";

    await setAllocationRunFailed({
      allocationRunId,
      message,
    });

    throw error;
  }
}