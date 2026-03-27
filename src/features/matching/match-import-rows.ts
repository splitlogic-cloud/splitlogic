import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
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

type SeedWorkCandidate = {
  title: string;
  artist: string | null;
  normalizedTitle: string;
  normalizedArtist: string | null;
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
  allocation_status: "pending";
  status: "matched" | "needs_review";
  updated_at: string;
};

type MatchImportRowsResult = {
  totalRows: number;
  matchedRows: number;
  reviewRows: number;
};

type WorkIndex = {
  byIsrc: Map<string, string>;
  byTitleArtist: Map<string, string>;
  byTitleOnly: Map<string, string>;
};

const READ_BATCH_SIZE = 1000;
const INSERT_CHUNK_SIZE = 100;
const RPC_UPDATE_CHUNK_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
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

function buildTitleArtistKey(normalizedTitle: string, normalizedArtist: string) {
  return `${normalizedTitle}__${normalizedArtist}`;
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

function extractSeedWorkCandidate(row: ImportRowRecord): SeedWorkCandidate | null {
  const candidate = extractCandidate(row);
  const normalizedTitle = normalizeText(candidate.title);

  if (!candidate.title || !normalizedTitle) {
    return null;
  }

  const normalizedArtist = normalizeText(candidate.artist);

  return {
    title: candidate.title,
    artist: candidate.artist,
    normalizedTitle,
    normalizedArtist,
    isrc: candidate.isrc,
  };
}

async function listImportRowsForMatching(
  importJobId: string
): Promise<ImportRowRecord[]> {
  const allRows: ImportRowRecord[] = [];
  let from = 0;

  while (true) {
    const to = from + READ_BATCH_SIZE - 1;

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

    if (data.length < READ_BATCH_SIZE) {
      break;
    }

    from += READ_BATCH_SIZE;
  }

  return allRows;
}

async function ensureWorksExistForImport(
  companyId: string,
  rows: ImportRowRecord[]
): Promise<void> {
  const uniqueByKey = new Map<string, SeedWorkCandidate>();

  for (const row of rows) {
    const candidate = extractSeedWorkCandidate(row);
    if (!candidate) continue;

    const key = candidate.isrc
      ? `isrc:${candidate.isrc}`
      : candidate.normalizedArtist
        ? buildTitleArtistKey(candidate.normalizedTitle, candidate.normalizedArtist)
        : candidate.normalizedTitle;

    if (!uniqueByKey.has(key)) {
      uniqueByKey.set(key, candidate);
    }
  }

  const candidates = Array.from(uniqueByKey.values());
  if (candidates.length === 0) return;

  const normalizedTitles = Array.from(
    new Set(candidates.map((c) => c.normalizedTitle))
  );

  const isrcs = Array.from(
    new Set(
      candidates
        .map((c) => c.isrc)
        .filter((value): value is string => Boolean(value))
    )
  );

  const existingByTitleArtist = new Set<string>();
  const existingByTitleOnly = new Set<string>();
  const existingByIsrc = new Set<string>();

  for (const titleChunk of chunk(normalizedTitles, 500)) {
    const { data, error } = await supabaseAdmin
      .from("works")
      .select("normalized_title, normalized_artist")
      .eq("company_id", companyId)
      .in("normalized_title", titleChunk);

    if (error) {
      throw new Error(`Failed to load existing works by title: ${error.message}`);
    }

    for (const row of data ?? []) {
      const record = row as {
        normalized_title: string | null;
        normalized_artist: string | null;
      };

      const normalizedTitle = readString(record.normalized_title);
      const normalizedArtist = readString(record.normalized_artist);

      if (!normalizedTitle) continue;

      existingByTitleOnly.add(normalizedTitle);

      if (normalizedArtist) {
        existingByTitleArtist.add(
          buildTitleArtistKey(normalizedTitle, normalizedArtist)
        );
      }
    }
  }

  if (isrcs.length > 0) {
    for (const isrcChunk of chunk(isrcs, 500)) {
      const { data, error } = await supabaseAdmin
        .from("works")
        .select("isrc")
        .eq("company_id", companyId)
        .in("isrc", isrcChunk);

      if (error) {
        throw new Error(`Failed to load existing works by ISRC: ${error.message}`);
      }

      for (const row of data ?? []) {
        const record = row as { isrc: string | null };
        const isrc = normalizeIsrc(readString(record.isrc));
        if (isrc) {
          existingByIsrc.add(isrc);
        }
      }
    }
  }

  const toInsert: Array<{
    company_id: string;
    title: string;
    artist: string | null;
    normalized_title: string;
    normalized_artist: string | null;
    isrc: string | null;
  }> = [];

  for (const candidate of candidates) {
    const existsByIsrc = candidate.isrc ? existingByIsrc.has(candidate.isrc) : false;
    const existsByTitleArtist = candidate.normalizedArtist
      ? existingByTitleArtist.has(
          buildTitleArtistKey(candidate.normalizedTitle, candidate.normalizedArtist)
        )
      : false;
    const existsByTitleOnly = existingByTitleOnly.has(candidate.normalizedTitle);

    if (existsByIsrc || existsByTitleArtist || existsByTitleOnly) {
      continue;
    }

    toInsert.push({
      company_id: companyId,
      title: candidate.title,
      artist: candidate.artist,
      normalized_title: candidate.normalizedTitle,
      normalized_artist: candidate.normalizedArtist,
      isrc: candidate.isrc,
    });

    existingByTitleOnly.add(candidate.normalizedTitle);

    if (candidate.normalizedArtist) {
      existingByTitleArtist.add(
        buildTitleArtistKey(candidate.normalizedTitle, candidate.normalizedArtist)
      );
    }

    if (candidate.isrc) {
      existingByIsrc.add(candidate.isrc);
    }
  }

  for (const insertChunk of chunk(toInsert, INSERT_CHUNK_SIZE)) {
    const { error } = await supabaseAdmin.from("works").insert(insertChunk);

    if (error) {
      throw new Error(`Failed to insert seeded works: ${error.message}`);
    }
  }
}

async function loadWorkIndex(companyId: string): Promise<WorkIndex> {
  const byIsrc = new Map<string, string>();
  const byTitleArtist = new Map<string, string>();
  const byTitleOnly = new Map<string, string>();

  let from = 0;

  while (true) {
    const to = from + 999;

    const { data, error } = await supabaseAdmin
      .from("works")
      .select("id, normalized_title, normalized_artist, isrc")
      .eq("company_id", companyId)
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load works index: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const record = row as {
        id: string | null;
        normalized_title: string | null;
        normalized_artist: string | null;
        isrc: string | null;
      };

      const workId = readString(record.id);
      const normalizedTitle = readString(record.normalized_title);
      const normalizedArtist = readString(record.normalized_artist);
      const isrc = normalizeIsrc(readString(record.isrc));

      if (!workId) continue;

      if (isrc && !byIsrc.has(isrc)) {
        byIsrc.set(isrc, workId);
      }

      if (normalizedTitle && normalizedArtist) {
        const key = buildTitleArtistKey(normalizedTitle, normalizedArtist);
        if (!byTitleArtist.has(key)) {
          byTitleArtist.set(key, workId);
        }
      }

      if (normalizedTitle && !byTitleOnly.has(normalizedTitle)) {
        byTitleOnly.set(normalizedTitle, workId);
      }
    }

    if (data.length < 1000) {
      break;
    }

    from += 1000;
  }

  return {
    byIsrc,
    byTitleArtist,
    byTitleOnly,
  };
}

function resolveRows(
  candidates: CandidateRow[],
  workIndex: WorkIndex
): RowResolution[] {
  const results: RowResolution[] = [];

  for (const candidate of candidates) {
    if (candidate.isrc) {
      const workId = workIndex.byIsrc.get(candidate.isrc);

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
      const key = buildTitleArtistKey(normalizedTitle, normalizedArtist);
      const workId = workIndex.byTitleArtist.get(key);

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

    if (normalizedTitle) {
      const workId = workIndex.byTitleOnly.get(normalizedTitle);

      if (workId) {
        results.push({
          rowId: candidate.rowId,
          workId,
          matched: true,
          source: "fuzzy",
          confidence: 0.7,
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
      allocation_status: "pending",
      status: matched ? "matched" : "needs_review",
      updated_at: now,
    };
  });
}

async function applyImportRowUpdatesRpc(
  importJobId: string,
  updates: ImportRowUpdate[]
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  for (const batch of chunk(updates, RPC_UPDATE_CHUNK_SIZE)) {
    const payload = batch.map((row) => ({
      id: row.id,
      work_id: row.work_id,
      matched_work_id: row.matched_work_id,
      match_confidence: row.match_confidence,
      match_source: row.match_source,
      allocation_status: row.allocation_status,
      status: row.status,
      updated_at: row.updated_at,
    }));

    const { error } = await supabaseAdmin.rpc("apply_import_row_match_updates", {
      p_import_job_id: importJobId,
      p_updates: payload,
    });

    if (error) {
      throw new Error(`apply_import_row_match_updates failed: ${error.message}`);
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

  await ensureWorksExistForImport(companyId, rows);

  const candidates = rows.map(extractCandidate);
  const workIndex = await loadWorkIndex(companyId);

  const resolutions = resolveRows(candidates, workIndex);
  const now = new Date().toISOString();
  const updates = buildImportRowUpdates(resolutions, now);

  await applyImportRowUpdatesRpc(importJobId, updates);

  return {
    totalRows: updates.length,
    matchedRows: updates.filter((row) => row.status === "matched").length,
    reviewRows: updates.filter((row) => row.status === "needs_review").length,
  };
}