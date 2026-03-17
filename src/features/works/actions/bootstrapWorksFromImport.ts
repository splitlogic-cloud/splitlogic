"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  normalizeIsrc,
  normalizeText,
  buildTitleArtistKey,
} from "@/features/works/work-matching";

type ImportRowRecord = {
  row_number?: number | null;
  raw: Record<string, unknown> | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getRawValue(
  raw: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = clean(raw[key]);
    if (value) return value;
  }
  return "";
}

export async function bootstrapWorksFromImport(params: {
  companyId: string;
  companySlug: string;
  importJobId: string;
}): Promise<{ inserted: number; skipped: number }> {
  const { companyId, companySlug, importJobId } = params;

  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select("row_number, raw")
    .eq("import_job_id", importJobId)
    .order("row_number", { ascending: true });

  if (error) {
    throw new Error(`Failed to load import rows: ${error.message}`);
  }

  const rows = (data ?? []) as ImportRowRecord[];

  const seen = new Set<string>();
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const raw =
      row.raw && typeof row.raw === "object"
        ? (row.raw as Record<string, unknown>)
        : null;

    if (!raw) {
      skipped += 1;
      console.log("[bootstrap works] skip: no raw object", {
        rowNumber: row.row_number,
      });
      continue;
    }

    const isrc = normalizeIsrc(
      getRawValue(raw, ["isrc", "asset_isrc", "track_isrc"])
    );

    const title = clean(
      getRawValue(raw, [
        "track",
        "title",
        "track_title",
        "work_title",
        "name",
        "product",
      ])
    );

    const artist = clean(
      getRawValue(raw, [
        "track_artist",
        "artist",
        "product_artist",
        "main_artist",
      ])
    );

    if (isrc === "GBKPL1942020" || title.toLowerCase().includes("jag")) {
      console.log("[bootstrap works] candidate row", {
        rowNumber: row.row_number,
        isrc,
        title,
        artist,
        raw,
      });
    }

    if (!isrc || !title) {
      skipped += 1;
      console.log("[bootstrap works] skip: missing isrc or title", {
        rowNumber: row.row_number,
        isrc,
        title,
        artist,
        raw,
      });
      continue;
    }

    const dedupeKey = `${isrc}__${normalizeText(title)}__${normalizeText(artist)}`;
    if (seen.has(dedupeKey)) {
      skipped += 1;
      console.log("[bootstrap works] skip: duplicate within import", {
        rowNumber: row.row_number,
        dedupeKey,
        isrc,
        title,
        artist,
      });
      continue;
    }
    seen.add(dedupeKey);

    const normalizedIsrc = normalizeIsrc(isrc);
    const normalizedTitle = normalizeText(title);
    const normalizedArtist = normalizeText(artist);
    const normalizedTitleArtist = buildTitleArtistKey(title, artist);

    const { data: existingByIsrc, error: existingByIsrcError } =
      await supabaseAdmin
        .from("works")
        .select("id, title, artist, isrc")
        .eq("company_id", companyId)
        .eq("isrc", isrc)
        .maybeSingle();

    if (existingByIsrcError) {
      throw new Error(
        `Failed checking existing work for ${isrc}: ${existingByIsrcError.message}`
      );
    }

    if (existingByIsrc) {
      skipped += 1;
      console.log("[bootstrap works] skip: existing work with same isrc", {
        rowNumber: row.row_number,
        incoming: { isrc, title, artist },
        existing: existingByIsrc,
      });
      continue;
    }

    const { error: insertError } = await supabaseAdmin.from("works").insert({
      company_id: companyId,
      isrc,
      title,
      artist: artist || null,
      normalized_isrc: normalizedIsrc,
      normalized_title: normalizedTitle,
      normalized_artist: normalizedArtist || null,
      normalized_title_artist: normalizedTitleArtist,
    });

    if (insertError) {
      throw new Error(`Failed inserting work ${isrc}: ${insertError.message}`);
    }

    inserted += 1;
    console.log("[bootstrap works] inserted", {
      rowNumber: row.row_number,
      isrc,
      title,
      artist,
    });
  }

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
  revalidatePath(`/c/${companySlug}/works`);

  return { inserted, skipped };
}