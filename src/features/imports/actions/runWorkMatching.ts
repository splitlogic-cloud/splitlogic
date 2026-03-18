"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildWorkMatcherIndex,
  matchImportRowFast,
  type WorkCandidate,
} from "@/features/works/work-matching";

type RawRecord = Record<string, unknown>;

type ImportRowRecord = {
  id: string;
  raw: unknown;
};

type WorkRow = {
  id: string;
  title: string | null;
  isrc: string | null;
  artist: string | null;
  normalized_isrc: string | null;
  normalized_title: string | null;
  normalized_artist: string | null;
  normalized_title_artist: string | null;
};

const BATCH_SIZE = 500;

function asRecord(value: unknown): RawRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as RawRecord;
}

function pickString(raw: RawRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

function getRowMatchInput(rawValue: unknown): {
  title: string | null;
  artist: string | null;
  isrc: string | null;
} {
  const raw = asRecord(rawValue);

  return {
    title: pickString(raw, ["title", "track", "track_title", "product"]),
    artist: pickString(raw, [
      "artist",
      "track_artist",
      "product_artist",
      "main_artist",
    ]),
    isrc: pickString(raw, ["isrc", "ISRC"]),
  };
}

export async function runWorkMatching(
  importJobId: string,
  companyId: string
): Promise<{ processed: number; matched: number }> {
  const { data: works, error: worksError } = await supabaseAdmin
    .from("works")
    .select(
      "id, title, isrc, artist, normalized_isrc, normalized_title, normalized_artist, normalized_title_artist"
    )
    .eq("company_id", companyId)
    .returns<WorkRow[]>();

  if (worksError) {
    throw new Error(`Failed to load works: ${worksError.message}`);
  }

  const workCandidates: WorkCandidate[] = (works ?? []).map((work) => ({
    id: work.id,
    title: work.title,
    isrc: work.isrc,
    artist: work.artist,
    normalized_isrc: work.normalized_isrc,
    normalized_title: work.normalized_title,
    normalized_artist: work.normalized_artist,
    normalized_title_artist: work.normalized_title_artist,
  }));

  const index = buildWorkMatcherIndex(workCandidates);

  let processed = 0;
  let matched = 0;

  while (true) {
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("import_rows")
      .select("id, raw")
      .eq("import_id", importJobId)
      .is("matched_work_id", null)
      .limit(BATCH_SIZE)
      .returns<ImportRowRecord[]>();

    if (rowsError) {
      throw new Error(`Failed to load import rows: ${rowsError.message}`);
    }

    const importRows = rows ?? [];

    if (importRows.length === 0) {
      break;
    }

    for (const row of importRows) {
      processed += 1;

      const input = getRowMatchInput(row.raw);

      const result = matchImportRowFast(index, {
        title: input.title,
        artist: input.artist,
        isrc: input.isrc,
      });

      if (!result.matchedWorkId) {
        continue;
      }

      const { error: updateError } = await supabaseAdmin
        .from("import_rows")
        .update({
          matched_work_id: result.matchedWorkId,
          match_source: result.source,
          match_confidence: result.confidence,
        })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(
          `Failed to update import row ${row.id}: ${updateError.message}`
        );
      }

      matched += 1;
    }

    if (importRows.length < BATCH_SIZE) {
      break;
    }
  }

  revalidatePath("/", "layout");

  return {
    processed,
    matched,
  };
}