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

// -----------------
// Helpers
// -----------------

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickFirstString(...values: unknown[]): string | null {
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
    .replace(
      /\b(remix|mix|edit|version|radio edit|extended|live|mono|stereo)\b/gi,
      " "
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

// -----------------
// Candidate extraction
// -----------------

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
      pickFirstString(canonical.isrc, normalized.isrc, raw.isrc, raw.ISRC)
    ) ?? null;

  return { rowId: row.id, title, artist, isrc };
}

// -----------------
// Load rows
// -----------------

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
    if (error) throw new Error(`Failed to load import rows: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows.push(...(data as ImportRowRecord[]));
    if (data.length < MATCH_BATCH_SIZE) break;
    from += MATCH_BATCH_SIZE;
  }

  return allRows;
}

// -----------------
// Load works by ISRC
// -----------------

async function loadWorksByIsrc(companyId: string, isrcs: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!isrcs.length) return map;
  for (const chunked of chunk(isrcs, 500)) {
    const { data, error } = await supabaseAdmin
      .from("works")
      .select("id, isrc")
      .eq("company_id", companyId)
      .in("isrc", chunked);
    if (error) throw new Error(`Failed to load works by ISRC: ${error.message}`);
    for (const row of data ?? []) {
      const workId = readString((row as any).id);
      const isrc = normalizeIsrc(readString((row as any).isrc));
      if (!workId || !isrc) continue;
      if (!map.has(isrc)) map.set(isrc, workId);
    }
  }
  return map;
}

// -----------------
// Build alias keys
// -----------------

function buildAliasKeysFromCandidates(candidates: CandidateRow[]): string[] {
  const keys = new Set<string>();
  for (const c of candidates) {
    const title = normalizeText(c.title);
    const artist = normalizeText(c.artist);
    if (!title) continue;
    // Use title+artist if available
    keys.add(artist ? buildAliasKey(title, artist) : title);
  }
  return Array.from(keys);
}

// -----------------
// Resolve rows with fallback
// -----------------

function resolveRows(
  candidates: CandidateRow[],
  worksByIsrc: Map<string, string>,
  aliasIndex: Map<string, string>
): RowResolution[] {
  const results: RowResolution[] = [];

  for (const c of candidates) {
    // 1️⃣ Try ISRC exact
    if (c.isrc && worksByIsrc.has(c.isrc)) {
      results.push({
        rowId: c.rowId,
        workId: worksByIsrc.get(c.isrc) ?? null,
        matched: true,
        source: "isrc_exact",
        confidence: 1,
      });
      continue;
    }

    const title = normalizeText(c.title);
    const artist = normalizeText(c.artist);

    // 2️⃣ Try title+artist exact
    if (title && artist) {
      const key = buildAliasKey(title, artist);
      if (aliasIndex.has(key)) {
        results.push({
          rowId: c.rowId,
          workId: aliasIndex.get(key) ?? null,
          matched: true,
          source: "title_artist_exact",
          confidence: 0.95,
        });
        continue;
      }
    }

    // 3️⃣ Fallback: title only fuzzy
    if (title && aliasIndex.has(title)) {
      results.push({
        rowId: c.rowId,
        workId: aliasIndex.get(title) ?? null,
        matched: true,
        source: "fuzzy",
        confidence: 0.7,
      });
      continue;
    }

    // 4️⃣ Needs review
    results.push({
      rowId: c.rowId,
      workId: null,
      matched: false,
      source: null,
      confidence: 0,
    });
  }

  return results;
}

// -----------------
// Build updates
// -----------------

function buildImportRowUpdates(resolutions: RowResolution[], now: string): ImportRowUpdate[] {
  return resolutions.map((r) => {
    const matched = r.matched && !!r.workId;
    return {
      id: r.rowId,
      work_id: matched ? r.workId : null,
      matched_work_id: matched ? r.workId : null,
      match_confidence: matched ? r.confidence : 0,
      match_source: matched ? r.source : null,
      status: matched ? "matched" : "needs_review",
      updated_at: now,
    };
  });
}

// -----------------
// Apply updates
// -----------------

async function applyImportRowUpdates(updates: ImportRowUpdate[]): Promise<void> {
  if (!updates.length) return;

  const matched = updates.filter((u) => u.status === "matched");
  const review = updates.filter((u) => u.status === "needs_review");

  for (const batch of chunk(matched, UPDATE_CHUNK_SIZE)) {
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
        if (error) throw new Error(`Failed matched row ${row.id}: ${error.message}`);
      })
    );
  }

  for (const batch of chunk(review, UPDATE_CHUNK_SIZE)) {
    const ids = batch.map((r) => r.id);
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
    if (error) throw new Error(`Failed review batch: ${error.message}`);
  }
}

// -----------------
// Main
// -----------------

export async function matchImportRowsForImport(
  companyId: string,
  importJobId: string
): Promise<MatchImportRowsResult> {
  if (!companyId) throw new Error("companyId required");
  if (!importJobId) throw new Error("importJobId required");

  const rows = await listImportRowsForMatching(importJobId);
  const candidates = rows.map(extractCandidate);

  const uniqueIsrcs = Array.from(new Set(candidates.map((c) => c.isrc).filter(Boolean)));
  const aliasKeys = buildAliasKeysFromCandidates(candidates);

  const worksByIsrc = await loadWorksByIsrc(companyId, uniqueIsrcs);

  const aliasIndexRaw = await loadWorkAliasIndexForCandidates({
    companyId,
    keys: aliasKeys,
    isrcs: uniqueIsrcs,
  });

  const aliasIndex = aliasIndexRaw.byKey;

  const resolutions = resolveRows(candidates, worksByIsrc, aliasIndex);
  const now = new Date().toISOString();
  const updates = buildImportRowUpdates(resolutions, now);

  await applyImportRowUpdates(updates);

  return {
    totalRows: updates.length,
    matchedRows: updates.filter((r) => r.status === "matched").length,
    reviewRows: updates.filter((r) => r.status === "needs_review").length,
  };
}