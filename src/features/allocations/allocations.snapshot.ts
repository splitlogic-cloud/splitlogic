import "server-only";
import type {
  ImportRowForAllocation,
  SplitForAllocation,
  SplitSnapshotItem,
  WorkSnapshot,
} from "./allocations-types";

export function buildWorkSnapshot(row: ImportRowForAllocation): WorkSnapshot {
  return {
    id: row.work_id ?? "",
    title: row.title ?? null,
    artist: row.artist ?? null,
    isrc: row.isrc ?? null,
    metadata: null,
  };
}

export function buildSplitSnapshot(splits: SplitForAllocation[]): SplitSnapshotItem[] {
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
      sortOrder: index,
      metadata: null,
    }));
}

export function buildRawRowSnapshot(row: ImportRowForAllocation): Record<string, unknown> {
  return row.raw_payload ?? {};
}

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