import "server-only";
import type { AllocationBlockerCode, ImportRowForAllocation, SplitForAllocation } from "./allocations-types";

export type AllocationValidationResult =
  | { ok: true }
  | { ok: false; blockerCode: AllocationBlockerCode; message: string; details?: Record<string, unknown> };

function round12(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

export function validateAllocationCandidate(params: {
  row: ImportRowForAllocation;
  splits: SplitForAllocation[];
}): AllocationValidationResult {
  const { row, splits } = params;

  if (!row.work_id) return { ok: false, blockerCode: "missing_work_match", message: "Import row has no matched work_id.", details: { importRowId: row.id } };
  if (!row.currency) return { ok: false, blockerCode: "currency_missing", message: "Import row has no currency.", details: { importRowId: row.id } };
  if (row.net_amount === null || row.net_amount === undefined) return { ok: false, blockerCode: "amount_missing", message: "Import row has no net amount.", details: { importRowId: row.id } };
  if (!Number.isFinite(Number(row.net_amount))) return { ok: false, blockerCode: "amount_missing", message: "Import row net amount is invalid.", details: { importRowId: row.id, netAmount: row.net_amount } };
  if (splits.length === 0) return { ok: false, blockerCode: "missing_splits", message: "Matched work has no splits.", details: { importRowId: row.id, workId: row.work_id } };

  const missingParty = splits.find(s => !s.party_id);
  if (missingParty) return { ok: false, blockerCode: "missing_party", message: "One or more splits are missing party_id.", details: { splitId: missingParty.id, workId: row.work_id } };

  const invalidShare = splits.find(s => !Number.isFinite(Number(s.share_fraction ?? 0)) || Number(s.share_fraction ?? 0) <= 0);
  if (invalidShare) return { ok: false, blockerCode: "split_sum_not_100", message: "One or more splits have invalid share_fraction.", details: { splitId: invalidShare.id, shareFraction: invalidShare.share_fraction } };

  const totalShare = round12(splits.reduce((sum, s) => sum + Number(s.share_fraction ?? 0), 0));
  if (Math.abs(totalShare - 1) > 0.000001) return { ok: false, blockerCode: "split_sum_not_100", message: "Split shares do not sum to 1.0.", details: { totalShare, workId: row.work_id } };

  return { ok: true };
}