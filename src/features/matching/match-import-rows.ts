// src/features/matching/match-import-rows.ts
import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildAliasKey,
  loadWorkAliasIndexForCandidates,
} from "@/features/matching/work-alias.repo";
import { normalizeIsrc } from "@/features/matching/normalize";

export { normalizeIsrc };

type JsonRecord = Record<string, unknown>;

type ImportRowRecord = {
  id: string;
  raw_title: string | null;
  canonical: JsonRecord | null;
  normalized: JsonRecord | null;
  raw: JsonRecord | null;
};

type CandidateRow = {
  rowId: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
};

type MatchSource = "isrc_exact" | "title_artist_exact" | "fuzzy" | "manual";

type RowResolution = {
  rowId: string;
  workId: string | null;
  matched: boolean;
  source: MatchSource | null;
  confidence: number;
};

type ImportRowUpdate = {
  id: string;
  work_id: string | null;
  matched_work_id: string | null;
  match_confidence: number;
  match_source: MatchSource | null;
  status: "matched" | "needs_review";
  updated_at: string;
};

type MatchImportRowsResult = {
  totalRows: number;
  matchedRows: number;
  reviewRows: number;
};

const MATCH_BATCH_SIZE = 200;
const UPDATE_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][];
function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunk size must be > 0");
  }

  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickFirstString(
  ...values: Array<unknown>
): string | null {
  for (const value of values) {
    const parsed = readString(value);
    if (parsed) return parsed;
  }
  return null;
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|featuring)\.?\b.*$/gi, " ")
    .replace(/\b(remix|mix|edit|version|radio edit|extended|live|mono|stereo)\b/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0 ? normalized : null;
}

function extractCandidate(row: ImportRowRecord): CandidateRow {
  const canonical = row.canonical ?? {};
  const normalized = row.normalized ?? {};
  const raw = row.raw ?? {};

  const title =
    pickFirstString(
      canonical.title,
      canonical.track_title,
      canonical.song_title,
      canonical.release_title,
      normalized.title,
      normalized.track_title,
      normalized.song_title,
      raw.title,
      raw.track_title,
      raw.song_title,
      row.raw_title
    ) ?? null;

  const artist =
    pickFirstString(
      canonical.artist,
      canonical.primary_artist,
      canonical.main_artist,
      canonical.artist_name,
      normalized.artist,
      normalized.primary_artist,
      normalized.main_artist,
      normalized.artist_name,
      raw.artist,
      raw.primary_artist,
      raw.main_artist,
      raw.artist_name
    ) ?? null;

  const isrc =
    normalizeIsrc(
      pickFirstString(
        canonical.isrc,
        normalized.isrc,
        raw.isrc,
        raw.ISRC
      )
    ) ?? null;

  return {
    rowId: row.id,
    title,
    artist,
    isrc,
  };
}

async function listImportRowsForMatching(importJobId: string): Promise<ImportRowRecord[]> {
  const allRows: ImportRowRecord[] = [];
  let from = 0;

  while (true) {
    const to = from + MATCH_BATCH_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("import_rows")
      .select("id, raw_title, canonical, normalized, raw")
      .eq("import_job_id", importJobId)
      .order("row_number", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load import rows for matching: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows.push(...(data as ImportRowRecord[]));

    if (data.length < MATCH_BATCH_SIZE) {
      break;
    }

    from += MATCH_BATCH_SIZE;
  }

  return allRows;
}

async function loadWorksByIsrc(
  companyId: string,
  isrcs: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  if (isrcs.length === 0) {
    return map;
  }

  for (const isrcChunk of chunk(isrcs, 500)) {
    const { data, error } = await supabaseAdmin
      .from("works")
      .select("id, isrc")
      .eq("company_id", companyId)
      .in("isrc", isrcChunk);

    if (error) {
      throw new Error(`Failed to load works by ISRC: ${error.message}`);
    }

    for (const row of data ?? []) {
      const workId = readString((row as JsonRecord).id);
      const isrc = normalizeIsrc(readString((row as JsonRecord).isrc));

      if (!workId || !isrc) continue;
      if (!map.has(isrc)) {
        map.set(isrc, workId);
      }
    }
  }

  return map;
}

function resolveRows(
  candidates: CandidateRow[],
  worksByIsrc: Map<string, string>,
  aliasIndex: Map<string, string>
): RowResolution[] {
  const results: RowResolution[] = [];

  for (const candidate of candidates) {
    if (candidate.isrc) {
      const workId = worksByIsrc.get(candidate.isrc);
      if (workId) {
        results.push({
          rowId: candidate.rowId,
          workId,
          matched: true,
          source: "isrc_exact",
          confidence: 1,
        });
        continue;
      }
    }

    const normalizedTitle = normalizeText(candidate.title);
    const normalizedArtist = normalizeText(candidate.artist);

    if (normalizedTitle && normalizedArtist) {
      const aliasKey = buildAliasKey(normalizedTitle, normalizedArtist);
      const workId = aliasIndex.get(aliasKey);

      if (workId) {
        results.push({
          rowId: candidate.rowId,
          workId,
          matched: true,
          source: "title_artist_exact",
          confidence: 0.95,
        });
        continue;
      }
    }

    results.push({
      rowId: candidate.rowId,
      workId: null,
      matched: false,
      source: null,
      confidence: 0,
    });
  }

  return results;
}

function buildImportRowUpdates(
  resolutions: RowResolution[],
  now: string
): ImportRowUpdate[] {
  return resolutions.map((resolution) => {
    const matched = resolution.matched && !!resolution.workId;

    return {
      id: resolution.rowId,
      work_id: matched ? resolution.workId : null,
      matched_work_id: matched ? resolution.workId : null,
      match_confidence: matched ? resolution.confidence : 0,
      match_source: matched ? resolution.source : null,
      status: matched ? "matched" : "needs_review",
      updated_at: now,
    };
  });
}

async function applyImportRowUpdates(updates: ImportRowUpdate[]): Promise<void> {
  if (updates.length === 0) return;

  const matchedUpdates = updates.filter((row) => row.status === "matched");
  const reviewUpdates = updates.filter((row) => row.status === "needs_review");

  for (const batch of chunk(matchedUpdates, UPDATE_CHUNK_SIZE)) {
    await Promise.all(
      batch.map(async (row) => {
        const { error } = await supabaseAdmin
          .from("import_rows")
          .update({
            work_id: row.work_id,
            matched_work_id: row.matched_work_id,
            match_confidence: row.match_confidence,
            match_source: row.match_source,
            status: "matched",
            updated_at: row.updated_at,
          })
          .eq("id", row.id);

        if (error) {
          throw new Error(
            `Failed to update matched import row ${row.id}: ${error.message}`
          );
        }
      })
    );
  }

  for (const batch of chunk(reviewUpdates, UPDATE_CHUNK_SIZE)) {
    const ids = batch.map((row) => row.id);
    const updatedAt = batch[0]?.updated_at ?? new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("import_rows")
      .update({
        work_id: null,
        matched_work_id: null,
        match_confidence: 0,
        match_source: null,
        status: "needs_review",
        updated_at: updatedAt,
      })
      .in("id", ids);

    if (error) {
      throw new Error(`Failed bulk update review rows: ${error.message}`);
    }
  }
}

export async function matchImportRowsForImport(
  companyId: string,
  importJobId: string
): Promise<MatchImportRowsResult> {
  if (!companyId) {
    throw new Error("matchImportRowsForImport requires companyId");
  }

  if (!importJobId) {
    throw new Error("matchImportRowsForImport requires importJobId");
  }

  const rows = await listImportRowsForMatching(importJobId);
  const candidates = rows.map(extractCandidate);

  const uniqueIsrcs = Array.from(
    new Set(
      candidates
        .map((row) => row.isrc)
        .filter((value): value is string => Boolean(value))
    )
  );

  const worksByIsrc = await loadWorksByIsrc(companyId, uniqueIsrcs);
  const aliasIndex = await loadWorkAliasIndexForCandidates(companyId, candidates);

  const resolutions = resolveRows(candidates, worksByIsrc, aliasIndex);
  const now = new Date().toISOString();
  const updates = buildImportRowUpdates(resolutions, now);

  await applyImportRowUpdates(updates);

  const matchedRows = updates.filter((row) => row.status === "matched").length;
  const reviewRows = updates.filter((row) => row.status === "needs_review").length;

  return {
    totalRows: updates.length,
    matchedRows,
    reviewRows,
  };
}