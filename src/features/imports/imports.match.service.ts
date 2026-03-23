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

type MatchUpdate = {
  id: string;
  matched_work_id: string | null;
  work_id: string | null;
  match_source: string | null;
  match_confidence: number;
  status: "matched" | "needs_review";
};

const UPDATE_CONCURRENCY = 20;

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunk size must be greater than 0");
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function applySingleRowUpdate(update: MatchUpdate): Promise<void> {
  const { id, ...values } = update;

  const { error } = await supabaseAdmin
    .from("import_rows")
    .update(values)
    .eq("id", id);

  if (error) {
    throw new Error(`update import row failed (${id}): ${error.message}`);
  }
}

async function applyUpdates(updates: MatchUpdate[]): Promise<void> {
  if (updates.length === 0) return;

  const chunks = chunkArray(updates, UPDATE_CONCURRENCY);

  for (const chunk of chunks) {
    await Promise.all(chunk.map((update) => applySingleRowUpdate(update)));
  }
}

async function refreshImportJobCounters(importId: string): Promise<void> {
  const { data: rows, error } = await supabaseAdmin
    .from("import_rows")
    .select("status, work_id, matched_work_id")
    .eq("import_id", importId)
    .limit(10000);

  if (error) {
    throw new Error(`reload import row counters failed: ${error.message}`);
  }

  const parsedRowCount = (rows ?? []).filter((row) => row.status === "parsed").length;
  const invalidRowCount = (rows ?? []).filter((row) => row.status === "invalid").length;
  const matchedRowCount = (rows ?? []).filter(
    (row) => row.work_id != null || row.matched_work_id != null
  ).length;
  const reviewRowCount = (rows ?? []).filter(
    (row) => row.status === "needs_review"
  ).length;

  const { error: updateJobError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: matchedRowCount > 0 ? "matched" : "parsed",
      parsed_row_count: parsedRowCount,
      invalid_row_count: invalidRowCount,
      matched_row_count: matchedRowCount,
      review_row_count: reviewRowCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", importId);

  if (updateJobError) {
    throw new Error(`update import job counters failed: ${updateJobError.message}`);
  }
}

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
    const normalized = normalizeIsrc(work.isrc);
    if (!normalized) continue;

    if (!worksByIsrc.has(normalized)) {
      worksByIsrc.set(normalized, work);
    }
  }

  const updates: MatchUpdate[] = [];
  let scanned = 0;
  let matched = 0;
  let unmatched = 0;

  for (const row of typedRows) {
    scanned += 1;

    const rawIsrc = readRawIsrc(row.raw);
    const normalizedRowIsrc = normalizeIsrc(rawIsrc);

    if (!normalizedRowIsrc) {
      updates.push({
        id: row.id,
        matched_work_id: null,
        work_id: null,
        match_source: null,
        match_confidence: 0,
        status: "needs_review",
      });
      unmatched += 1;
      continue;
    }

    const matchedWork = worksByIsrc.get(normalizedRowIsrc);

    if (!matchedWork) {
      updates.push({
        id: row.id,
        matched_work_id: null,
        work_id: null,
        match_source: null,
        match_confidence: 0,
        status: "needs_review",
      });
      unmatched += 1;
      continue;
    }

    updates.push({
      id: row.id,
      matched_work_id: matchedWork.id,
      work_id: matchedWork.id,
      match_source: "isrc_exact",
      match_confidence: 1,
      status: "matched",
    });
    matched += 1;
  }

  await applyUpdates(updates);
  await refreshImportJobCounters(importId);

  return {
    scanned,
    matched,
    unmatched,
  };
}