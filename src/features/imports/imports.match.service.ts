import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeIsrc, readRawIsrc } from "./imports.matching";

type ImportRowForMatch = {
  id: string;
  import_id: string;
  raw: unknown;
  matched_work_id: string | null;
};

type WorkRow = {
  id: string;
  isrc: string | null;
};

export async function runImportWorkMatching(importId: string): Promise<{
  scanned: number;
  matched: number;
  unmatched: number;
}> {
  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", importId)
    .maybeSingle();

  if (importJobError) {
    throw new Error(`load import job failed: ${importJobError.message}`);
  }

  if (!importJob) {
    throw new Error("Import job not found");
  }

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("import_rows")
    .select("id, import_id, raw, matched_work_id")
    .eq("import_id", importId)
    .order("row_number", { ascending: true });

  if (rowsError) {
    throw new Error(`load import rows failed: ${rowsError.message}`);
  }

  const typedRows = (rows ?? []) as ImportRowForMatch[];

  const { data: works, error: worksError } = await supabaseAdmin
    .from("works")
    .select("id, isrc")
    .eq("company_id", importJob.company_id);

  if (worksError) {
    throw new Error(`load works failed: ${worksError.message}`);
  }

  const typedWorks = (works ?? []) as WorkRow[];

  const worksByIsrc = new Map<string, WorkRow>();

  for (const work of typedWorks) {
    const normalizedIsrc = normalizeIsrc(work.isrc);
    if (!normalizedIsrc) continue;

    // exact one-to-one assumption in v1
    if (!worksByIsrc.has(normalizedIsrc)) {
      worksByIsrc.set(normalizedIsrc, work);
    }
  }

  let scanned = 0;
  let matched = 0;
  let unmatched = 0;

  for (const row of typedRows) {
    scanned += 1;

    const rawIsrc = readRawIsrc(row.raw);
    const normalizedIsrc = normalizeIsrc(rawIsrc);

    if (!normalizedIsrc) {
      const { error } = await supabaseAdmin
        .from("import_rows")
        .update({
          matched_work_id: null,
          match_source: null,
          match_confidence: 0,
        })
        .eq("id", row.id);

      if (error) {
        throw new Error(`update unmatched row failed (${row.id}): ${error.message}`);
      }

      unmatched += 1;
      continue;
    }

    const matchedWork = worksByIsrc.get(normalizedIsrc);

    if (!matchedWork) {
      const { error } = await supabaseAdmin
        .from("import_rows")
        .update({
          matched_work_id: null,
          match_source: null,
          match_confidence: 0,
        })
        .eq("id", row.id);

      if (error) {
        throw new Error(`update unmatched row failed (${row.id}): ${error.message}`);
      }

      unmatched += 1;
      continue;
    }

    const { error } = await supabaseAdmin
      .from("import_rows")
      .update({
        matched_work_id: matchedWork.id,
        match_source: "isrc_exact",
        match_confidence: 1,
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(`update matched row failed (${row.id}): ${error.message}`);
    }

    matched += 1;
  }

  return {
    scanned,
    matched,
    unmatched,
  };
}