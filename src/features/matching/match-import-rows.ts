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
const UPDATE_CHUNK_SIZE = 25;
const INSERT_CHUNK_SIZE = 100;

const RETRY_COUNT = 5;
const RETRY_BASE_DELAY = 400;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function retryDelay(attempt: number) {
  return RETRY_BASE_DELAY * Math.pow(2, attempt);
}

function isRetryable(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504") ||
    m.includes("gateway") ||
    m.includes("timeout") ||
    m.includes("network")
  );
}

async function updateRowWithRetry(id: string, payload: any) {
  let lastError = "";

  for (let i = 0; i < RETRY_COUNT; i++) {
    const { error } = await supabaseAdmin
      .from("import_rows")
      .update(payload)
      .eq("id", id);

    if (!error) return;

    lastError = error.message;

    if (i === RETRY_COUNT - 1 || !isRetryable(error.message)) {
      throw new Error(`Update failed ${id}: ${error.message}`);
    }

    await sleep(retryDelay(i));
  }

  throw new Error(`Update failed ${id}: ${lastError}`);
}

function normalizeText(v: string | null | undefined) {
  if (!v) return null;

  return v
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function extractCandidate(row: ImportRowRecord): CandidateRow {
  const raw = row.raw ?? {};
  const canonical = row.canonical ?? {};

  const title =
    (canonical.title as string) ||
    (raw.title as string) ||
    row.raw_title ||
    null;

  const artist =
    (canonical.artist as string) ||
    (raw.artist as string) ||
    null;

  const isrc =
    normalizeIsrc(
      (canonical.isrc as string) ||
      (raw.isrc as string) ||
      null
    ) ?? null;

  return {
    rowId: row.id,
    title,
    artist,
    isrc,
  };
}

async function listRows(importJobId: string) {
  const all: ImportRowRecord[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("import_rows")
      .select("id, raw_title, canonical, normalized, raw")
      .eq("import_job_id", importJobId)
      .range(from, from + READ_BATCH_SIZE - 1);

    if (error) throw new Error(error.message);

    if (!data?.length) break;

    all.push(...(data as ImportRowRecord[]));

    if (data.length < READ_BATCH_SIZE) break;

    from += READ_BATCH_SIZE;
  }

  return all;
}

async function loadWorkIndex(companyId: string): Promise<WorkIndex> {
  const byIsrc = new Map<string, string>();
  const byTitleArtist = new Map<string, string>();
  const byTitleOnly = new Map<string, string>();

  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("works")
      .select("id, normalized_title, normalized_artist, isrc")
      .eq("company_id", companyId)
      .range(from, from + 999);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const w of data) {
      const id = w.id;
      const isrc = normalizeIsrc(w.isrc);
      const t = w.normalized_title;
      const a = w.normalized_artist;

      if (isrc && !byIsrc.has(isrc)) {
        byIsrc.set(isrc, id);
      }

      if (t && a) {
        byTitleArtist.set(`${t}_${a}`, id);
      }

      if (t) {
        byTitleOnly.set(t, id);
      }
    }

    if (data.length < 1000) break;
    from += 1000;
  }

  return { byIsrc, byTitleArtist, byTitleOnly };
}

function resolveRows(rows: CandidateRow[], index: WorkIndex): RowResolution[] {
  return rows.map((r) => {
    if (r.isrc && index.byIsrc.has(r.isrc)) {
      return {
        rowId: r.rowId,
        workId: index.byIsrc.get(r.isrc)!,
        matched: true,
        source: "isrc_exact",
        confidence: 1,
      };
    }

    const t = normalizeText(r.title);
    const a = normalizeText(r.artist);

    if (t && a) {
      const key = `${t}_${a}`;
      if (index.byTitleArtist.has(key)) {
        return {
          rowId: r.rowId,
          workId: index.byTitleArtist.get(key)!,
          matched: true,
          source: "title_artist_exact",
          confidence: 0.95,
        };
      }
    }

    if (t && index.byTitleOnly.has(t)) {
      return {
        rowId: r.rowId,
        workId: index.byTitleOnly.get(t)!,
        matched: true,
        source: "fuzzy",
        confidence: 0.7,
      };
    }

    return {
      rowId: r.rowId,
      workId: null,
      matched: false,
      source: null,
      confidence: 0,
    };
  });
}

async function applyUpdates(updates: ImportRowUpdate[]) {
  for (const batch of chunk(updates, UPDATE_CHUNK_SIZE)) {
    for (const row of batch) {
      await updateRowWithRetry(row.id, {
        work_id: row.work_id,
        matched_work_id: row.matched_work_id,
        match_confidence: row.match_confidence,
        match_source: row.match_source,
        allocation_status: "pending",
        status: row.status,
        updated_at: row.updated_at,
      });

      await sleep(20);
    }
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

export async function matchImportRowsForImport(
  companyId: string,
  importJobId: string
): Promise<MatchImportRowsResult> {
  const rows = await listRows(importJobId);

  const candidates = rows.map(extractCandidate);
  const index = await loadWorkIndex(companyId);

  const resolutions = resolveRows(candidates, index);

  const now = new Date().toISOString();

  const updates: ImportRowUpdate[] = resolutions.map((r) => ({
    id: r.rowId,
    work_id: r.workId,
    matched_work_id: r.workId,
    match_confidence: r.matched ? r.confidence : 0,
    match_source: r.source,
    allocation_status: "pending",
    status: r.matched ? "matched" : "needs_review",
    updated_at: now,
  }));

  await applyUpdates(updates);

  return {
    totalRows: updates.length,
    matchedRows: updates.filter((r) => r.status === "matched").length,
    reviewRows: updates.filter((r) => r.status === "needs_review").length,
  };
}