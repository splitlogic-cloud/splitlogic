"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildTitleArtistKey,
  decideBestWorkMatch,
  normalizeArtist,
  normalizeIsrc,
  normalizeTitle,
  type MatchCandidate,
} from "@/features/works/work-matching";

type ImportRowRecord = {
  id: string;
  raw: unknown;
};

type RawRecord = Record<string, unknown>;

type WorkRow = {
  id: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  normalized_title: string | null;
  normalized_artist: string | null;
  normalized_isrc: string | null;
  normalized_title_artist: string | null;
};

function asRecord(value: unknown): RawRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as RawRecord;
}

function pickString(raw: RawRecord, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getInputFromRaw(rawValue: unknown) {
  const raw = asRecord(rawValue);

  const title = pickString(raw, [
    "title",
    "track",
    "track_title",
    "song_title",
    "work_title",
    "release_title",
    "product",
  ]);

  const artist = pickString(raw, [
    "artist",
    "track_artist",
    "artist_name",
    "main_artist",
    "product_artist",
  ]);

  const isrc = pickString(raw, ["isrc", "track_isrc", "asset_isrc"]);

  return { title, artist, isrc };
}

function buildCandidatePool(
  works: WorkRow[],
  title: string,
  artist: string,
  isrc: string
): MatchCandidate[] {
  const normalizedTitle = normalizeTitle(title);
  const normalizedArtist = normalizeArtist(artist);
  const normalizedIsrc = normalizeIsrc(isrc);
  const normalizedKey = buildTitleArtistKey(title, artist);

  const filtered = works.filter((work) => {
    const workIsrc = normalizeIsrc(work.isrc ?? work.normalized_isrc);
    const workTitle = work.normalized_title?.trim()
      ? work.normalized_title
      : normalizeTitle(work.title);
    const workArtist = work.normalized_artist?.trim()
      ? work.normalized_artist
      : normalizeArtist(work.artist);
    const workKey = work.normalized_title_artist?.trim()
      ? work.normalized_title_artist
      : buildTitleArtistKey(work.title, work.artist);

    if (normalizedIsrc && workIsrc === normalizedIsrc) return true;
    if (normalizedKey !== "__" && workKey === normalizedKey) return true;
    if (normalizedTitle && workTitle === normalizedTitle) return true;
    if (normalizedArtist && workArtist === normalizedArtist) return true;

    return false;
  });

  if (filtered.length > 0) {
    return filtered;
  }

  return works.slice(0, 300);
}

export async function matchImportRowsForImport(params: {
  companyId: string;
  importId: string;
}): Promise<{
  processed: number;
  matched: number;
  unmatched: number;
}> {
  const { companyId, importId } = params;

  const [{ data: importRows, error: importRowsError }, { data: works, error: worksError }] =
    await Promise.all([
      supabaseAdmin
        .from("import_rows")
        .select("id, raw")
        .eq("import_id", importId),

      supabaseAdmin
        .from("works")
        .select(
          `
            id,
            title,
            artist,
            isrc,
            normalized_title,
            normalized_artist,
            normalized_isrc,
            normalized_title_artist
          `
        )
        .eq("company_id", companyId),
    ]);

  if (importRowsError) {
    throw new Error(`Failed to load import rows: ${importRowsError.message}`);
  }

  if (worksError) {
    throw new Error(`Failed to load works: ${worksError.message}`);
  }

  const importRowList = (importRows ?? []) as ImportRowRecord[];
  const workList = (works ?? []) as WorkRow[];

  let processed = 0;
  let matched = 0;
  let unmatched = 0;

  for (const row of importRowList) {
    const input = getInputFromRaw(row.raw);
    processed += 1;

    if (!input.title && !input.isrc) {
      await supabaseAdmin
        .from("import_rows")
        .update({
          matched_work_id: null,
          match_source: null,
          match_confidence: null,
        })
        .eq("id", row.id);

      unmatched += 1;
      continue;
    }

    const candidates = buildCandidatePool(
      workList,
      input.title,
      input.artist,
      input.isrc
    );

    const decision = decideBestWorkMatch(input, candidates);

    if (!decision.matchedWorkId) {
      await supabaseAdmin
        .from("import_rows")
        .update({
          matched_work_id: null,
          match_source: null,
          match_confidence: null,
        })
        .eq("id", row.id);

      unmatched += 1;
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("import_rows")
      .update({
        matched_work_id: decision.matchedWorkId,
        match_source: decision.source,
        match_confidence: decision.confidence,
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(`Failed to update matched row ${row.id}: ${updateError.message}`);
    }

    matched += 1;
  }

  return {
    processed,
    matched,
    unmatched,
  };
}