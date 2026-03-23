"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  normalizeIsrc,
  normalizeText,
  buildTitleArtistKey,
} from "@/features/works/work-matching";
import { buildAliasKey } from "@/features/matching/work-alias.repo";

type ImportRowRecord = {
  row_number?: number | null;
  raw: Record<string, unknown> | null;
  canonical?: Record<string, unknown> | null;
  normalized?: Record<string, unknown> | null;
};

type WorkRecord = {
  id: string;
  isrc: string | null;
  title: string | null;
  artist: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getRawValue(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = clean(raw[key]);
    if (value) return value;
  }
  return "";
}

function pickFromObjects(
  objects: Array<Record<string, unknown> | null | undefined>,
  keys: string[]
): string {
  for (const obj of objects) {
    if (!obj) continue;
    for (const key of keys) {
      const value = clean(obj[key]);
      if (value) return value;
    }
  }
  return "";
}

async function ensureAlias(params: {
  companyId: string;
  workId: string;
  title: string;
  artist: string;
  isrc: string | null;
}): Promise<void> {
  const aliasKey = buildAliasKey(params.title, params.artist);

  const { error } = await supabaseAdmin.from("work_aliases").upsert(
    {
      company_id: params.companyId,
      work_id: params.workId,
      key: aliasKey,
      title: normalizeText(params.title),
      artist: normalizeText(params.artist),
      isrc: params.isrc ? normalizeIsrc(params.isrc) : null,
    },
    { onConflict: "company_id,key" }
  );

  if (error) {
    throw new Error(`Failed upserting work alias: ${error.message}`);
  }
}

export async function bootstrapWorksFromImport(params: {
  companyId: string;
  companySlug: string;
  importJobId: string;
}): Promise<{ inserted: number; skipped: number; aliasesUpserted: number }> {
  const { companyId, companySlug, importJobId } = params;

  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select("row_number, raw, canonical, normalized")
    .eq("import_job_id", importJobId)
    .order("row_number", { ascending: true });

  if (error) {
    throw new Error(`Failed to load import rows: ${error.message}`);
  }

  const rows = (data ?? []) as ImportRowRecord[];

  const seen = new Set<string>();
  let inserted = 0;
  let skipped = 0;
  let aliasesUpserted = 0;

  for (const row of rows) {
    const raw =
      row.raw && typeof row.raw === "object"
        ? (row.raw as Record<string, unknown>)
        : null;

    const canonical =
      row.canonical && typeof row.canonical === "object"
        ? (row.canonical as Record<string, unknown>)
        : null;

    const normalized =
      row.normalized && typeof row.normalized === "object"
        ? (row.normalized as Record<string, unknown>)
        : null;

    const isrc = normalizeIsrc(
      pickFromObjects([normalized, canonical, raw], [
        "isrc",
        "ISRC",
        "isrc_code",
        "track_isrc",
        "asset_isrc",
        "sound_recording_code",
      ])
    );

    const title = clean(
      pickFromObjects([normalized, canonical, raw], [
        "title",
        "Title",
        "track",
        "Track",
        "track_title",
        "Track Title",
        "track_name",
        "Track Name",
        "work_title",
        "Work Title",
        "song",
        "Song",
        "song_title",
        "Song Title",
        "recording",
        "Recording",
        "name",
        "product",
      ])
    );

    const artist = clean(
      pickFromObjects([normalized, canonical, raw], [
        "artist",
        "Artist",
        "artist_name",
        "Artist Name",
        "track_artist",
        "Track Artist",
        "product_artist",
        "Product Artist",
        "main_artist",
        "Main Artist",
      ])
    );

    if (!isrc && !title) {
      skipped += 1;
      continue;
    }

    const dedupeKey = `${isrc ?? ""}__${normalizeText(title)}__${normalizeText(artist)}`;
    if (seen.has(dedupeKey)) {
      skipped += 1;
      continue;
    }
    seen.add(dedupeKey);

    let work: WorkRecord | null = null;

    if (isrc) {
      const { data: existingByIsrc, error: existingByIsrcError } = await supabaseAdmin
        .from("works")
        .select("id, isrc, title, artist")
        .eq("company_id", companyId)
        .eq("isrc", isrc)
        .maybeSingle();

      if (existingByIsrcError) {
        throw new Error(
          `Failed checking existing work by ISRC ${isrc}: ${existingByIsrcError.message}`
        );
      }

      if (existingByIsrc) {
        work = existingByIsrc as WorkRecord;
      }
    }

    if (!work && title) {
      const normalizedTitleArtist = buildTitleArtistKey(title, artist);

      const { data: existingByTitleArtist, error: existingByTitleArtistError } =
        await supabaseAdmin
          .from("works")
          .select("id, isrc, title, artist")
          .eq("company_id", companyId)
          .eq("normalized_title_artist", normalizedTitleArtist)
          .maybeSingle();

      if (existingByTitleArtistError) {
        throw new Error(
          `Failed checking existing work by title/artist ${title}: ${existingByTitleArtistError.message}`
        );
      }

      if (existingByTitleArtist) {
        work = existingByTitleArtist as WorkRecord;
      }
    }

    if (!work) {
      if (!title || !isrc) {
        skipped += 1;
        continue;
      }

      const normalizedIsrc = normalizeIsrc(isrc);
      const normalizedTitle = normalizeText(title);
      const normalizedArtist = normalizeText(artist);
      const normalizedTitleArtist = buildTitleArtistKey(title, artist);

      const { data: insertedWork, error: insertError } = await supabaseAdmin
        .from("works")
        .insert({
          company_id: companyId,
          isrc,
          title,
          artist: artist || null,
          normalized_isrc: normalizedIsrc,
          normalized_title: normalizedTitle,
          normalized_artist: normalizedArtist || null,
          normalized_title_artist: normalizedTitleArtist,
        })
        .select("id, isrc, title, artist")
        .single();

      if (insertError || !insertedWork) {
        throw new Error(`Failed inserting work ${isrc}: ${insertError?.message ?? "unknown"}`);
      }

      work = insertedWork as WorkRecord;
      inserted += 1;
    }

    if (title) {
      await ensureAlias({
        companyId,
        workId: work.id,
        title,
        artist,
        isrc: isrc ?? work.isrc ?? null,
      });
      aliasesUpserted += 1;
    }
  }

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
  revalidatePath(`/c/${companySlug}/works`);

  return { inserted, skipped, aliasesUpserted };
}