import "server-only";
import type {
  ImportRowForAllocation,
  SplitForAllocation,
  SplitSnapshotItem,
  WorkSnapshot,
} from "./allocations-types";

/**
 * Build a snapshot of the work data from an import row
 */
export function buildWorkSnapshot(row: ImportRowForAllocation): WorkSnapshot {
  return {
    id: row.work_id ?? "",
    title: row.title ?? null,
    artist: row.artist ?? null,
    isrc: row.isrc ?? null,
    metadata: null, // placeholder for future extended metadata
  };
}

/**
 * Build a snapshot of splits for a work
 */
export function buildSplitSnapshot(splits: SplitForAllocation[]): SplitSnapshotItem[] {
  // sort by creation date, then ID for deterministic ordering
  return [...splits]
    .sort((a, b) => {
      const aCreated = a.created_at ?? "";
      const bCreated = b.created_at ?? "";
      if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
      return a.id.localeCompare(b.id);
    })
    .map((split, index) => ({
      splitId: split.id,
      partyId: split.party_id ?? "",
      shareFraction: Number(split.share_fraction ?? 0),
      role: split.role ?? null,
      validFrom: split.valid_from ?? null,
      validTo: split.valid_to ?? null,
      sortOrder: index, // deterministic order for auditing
      metadata: null, // placeholder for future extended metadata
    }));
}

/**
 * Build a snapshot of the raw import row
 */
export function buildRawRowSnapshot(row: ImportRowForAllocation): Record<string, unknown> {
  return row.raw_payload ?? {};
}

/**
 * Build a snapshot of the normalized/canonical row
 */
export function buildNormalizedRowSnapshot(row: ImportRowForAllocation): Record<string, unknown> {
  return row.normalized_payload ?? {
    title: row.title ?? null,
    artist: row.artist ?? null,
    isrc: row.isrc ?? null,
    currency: row.currency ?? null,
    grossAmount: row.gross_amount ?? null,
    netAmount: row.net_amount ?? null,
  };
}