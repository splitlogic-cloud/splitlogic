"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildWorkMatcherIndex,
  matchImportRowFast,
  type WorkCandidate,
} from "@/features/works/work-matching";

type ImportRowRecord = {
  id: string;
  raw: unknown;
};

type WorkRow = {
  id: string;
  company_id: string | null;
  title: string | null;
  isrc: string | null;
  artist: string | null;
  normalized_isrc: string | null;
  normalized_title: string | null;
  normalized_artist: string | null;
  normalized_title_artist: string | null;
};

const BATCH_SIZE = 500;

export async function runWorkMatching(
  importJobId: string,
  companyId: string
): Promise<{ processed: number; matched: number }> {
  const { data: works, error: worksError } = await supabaseAdmin
    .from("works")
    .select(
      "id, company_id, title, isrc, artist, normalized_isrc, normalized_title, normalized_artist, normalized_title_artist"
    )
    .eq("company_id", companyId)
    .returns<WorkRow[]>();

  if (worksError) {
    throw new Error(`Failed to load works: ${worksError.message}`);
  }

  const workCandidates: WorkCandidate[] = (works ?? []).map((work) => ({
    id: work.id,
    company_id: work.company_id,
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
      
      const result = matchImportRowFast(index, {
        title: row.title ?? null,
        artist: row.artist ?? null,
        isrc: row.isrc ?? null,
      });

      if (!result.matchedWorkId) continue;

      const { error: updateError } = await supabaseAdmin
        .from("import_rows")
        .update({
          matched_work_id: result.matchedWorkId,
          match_source: result.matchSource,
          match_confidence: result.matchConfidence,
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