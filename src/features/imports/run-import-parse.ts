import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseImportFile } from "@/features/imports/parse-import-file";
import { canonicalizeImportRow } from "@/features/imports/canonicalize-import-row";
import {
  insertImportRows,
  resetImportJobData,
} from "@/features/imports/imports.repo";
import { normalizeIsrc } from "@/features/matching/normalize";

type ImportJobRecord = {
  id: string;
  company_id: string;
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
};

type CanonicalRow = ReturnType<typeof canonicalizeImportRow>;

type WorkSeedCandidate = {
  title: string;
  artist: string | null;
  normalizedTitle: string;
  normalizedArtist: string | null;
  isrc: string | null;
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickFirstRawString(
  raw: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = toTrimmedString(raw[key]);
    if (value) return value;
  }
  return null;
}

function normalizeRowStatus(params: {
  title: string | null;
  isrc: string | null;
  currency: string | null;
  netAmount: number | null;
  grossAmount: number | null;
}): "parsed" | "invalid" {
  const hasIdentifier = Boolean(params.isrc || params.title);
  const hasAmount = params.netAmount !== null || params.grossAmount !== null;
  const hasCurrency = Boolean(params.currency);

  if (!hasIdentifier || !hasAmount || !hasCurrency) {
    return "invalid";
  }

  return "parsed";
}

function buildNormalizedRow(canonical: CanonicalRow) {
  return {
    title: canonical.title?.trim() ?? null,
    artist: canonical.artist?.trim() ?? null,
    isrc: canonical.isrc?.trim().toUpperCase() ?? null,
    currency: canonical.currency?.trim().toUpperCase() ?? null,
    source: canonical.source?.trim() ?? null,
    territory: canonical.territory?.trim().toUpperCase() ?? null,
    quantity: canonical.quantity ?? null,
    net_amount: canonical.net_amount ?? null,
    gross_amount: canonical.gross_amount ?? null,
    statement_date: canonical.statement_date ?? null,
  };
}

function resolveRawTitle(
  raw: Record<string, unknown>,
  canonical: CanonicalRow
): string | null {
  return (
    canonical.title ??
    pickFirstRawString(raw, [
      "title",
      "Title",
      "track",
      "Track",
      "TRACK",
      "track_title",
      "Track Title",
      "track_name",
      "Track Name",
      "song_title",
      "Song Title",
      "song",
      "Song",
      "asset_title",
      "Asset Title",
      "release_track_name",
      "Release Track Name",
      "work_title",
      "Work Title",
      "recording",
      "Recording",
    ])
  );
}

function resolveStorageLocation(job: ImportJobRecord): {
  bucket: string;
  path: string;
} {
  const bucket = job.storage_bucket?.trim() || "imports";
  const path = job.storage_path?.trim() || null;

  if (!path) {
    throw new Error("Import job is missing storage_path.");
  }

  return { bucket, path };
}

async function downloadImportFileText(job: ImportJobRecord): Promise<string> {
  const { bucket, path } = resolveStorageLocation(job);

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .download(path);

  if (error || !data) {
    throw new Error(
      `Failed to download import file from storage: ${error?.message ?? "unknown error"}`
    );
  }

  const text = await data.text();

  if (!text.trim()) {
    throw new Error("Downloaded import file is empty.");
  }

  return text;
}

async function setImportJobStatus(
  importJobId: string,
  values: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("import_jobs")
    .update(values)
    .eq("id", importJobId);

  if (error) {
    throw new Error(`Failed to update import job: ${error.message}`);
  }
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

function buildTitleArtistKey(
  normalizedTitle: string,
  normalizedArtist: string
): string {
  return `${normalizedTitle}__${normalizedArtist}`;
}

function extractWorkSeedCandidate(
  canonical: CanonicalRow
): WorkSeedCandidate | null {
  const title = canonical.title?.trim() ?? null;
  if (!title) return null;

  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return null;

  const artist = canonical.artist?.trim() ?? null;
  const normalizedArtist = normalizeText(artist);
  const isrc = normalizeIsrc(canonical.isrc ?? null) ?? null;

  return {
    title,
    artist,
    normalizedTitle,
    normalizedArtist,
    isrc,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error("chunk size must be > 0");
  }

  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function ensureWorksExistForCandidates(params: {
  companyId: string;
  candidates: WorkSeedCandidate[];
  now: string;
}): Promise<number> {
  const { companyId, candidates, now } = params;

  if (candidates.length === 0) {
    return 0;
  }

  const uniqueByKey = new Map<string, WorkSeedCandidate>();

  for (const candidate of candidates) {
    const key = candidate.isrc
      ? `isrc:${candidate.isrc}`
      : candidate.normalizedArtist
        ? buildTitleArtistKey(candidate.normalizedTitle, candidate.normalizedArtist)
        : candidate.normalizedTitle;

    if (!uniqueByKey.has(key)) {
      uniqueByKey.set(key, candidate);
    }
  }

  const uniqueCandidates = Array.from(uniqueByKey.values());

  const normalizedTitles = Array.from(
    new Set(uniqueCandidates.map((candidate) => candidate.normalizedTitle))
  );

  const isrcs = Array.from(
    new Set(
      uniqueCandidates
        .map((candidate) => candidate.isrc)
        .filter((value): value is string => Boolean(value))
    )
  );

  const existingByIsrc = new Set<string>();
  const existingByTitleArtist = new Set<string>();
  const existingByTitleOnly = new Set<string>();

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

      const normalizedTitle = record.normalized_title?.trim() ?? null;
      const normalizedArtist = record.normalized_artist?.trim() ?? null;

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
        const isrc = normalizeIsrc(record.isrc ?? null);
        if (isrc) {
          existingByIsrc.add(isrc);
        }
      }
    }
  }

  const worksToInsert: Array<{
    company_id: string;
    title: string;
    artist: string | null;
    normalized_title: string;
    normalized_artist: string | null;
    isrc: string | null;
    created_at: string;
    updated_at: string;
  }> = [];

  for (const candidate of uniqueCandidates) {
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

    worksToInsert.push({
      company_id: companyId,
      title: candidate.title,
      artist: candidate.artist,
      normalized_title: candidate.normalizedTitle,
      normalized_artist: candidate.normalizedArtist,
      isrc: candidate.isrc,
      created_at: now,
      updated_at: now,
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

  if (worksToInsert.length === 0) {
    return 0;
  }

  for (const insertChunk of chunk(worksToInsert, 200)) {
    const { error } = await supabaseAdmin
      .from("works")
      .insert(insertChunk);

    if (error) {
      throw new Error(`Failed to insert works from import: ${error.message}`);
    }
  }

  return worksToInsert.length;
}

export async function runImportParse(importJobId: string): Promise<{
  importJobId: string;
  insertedRowCount: number;
  parsedRowCount: number;
  invalidRowCount: number;
  createdWorkCount: number;
}> {
  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select(`
      id,
      company_id,
      file_name,
      storage_bucket,
      storage_path
    `)
    .eq("id", importJobId)
    .maybeSingle();

  if (importJobError) {
    throw new Error(`Failed to load import job: ${importJobError.message}`);
  }

  if (!importJob) {
    throw new Error("Import job not found.");
  }

  const job = importJob as ImportJobRecord;
  const now = new Date().toISOString();

  await setImportJobStatus(importJobId, {
    status: "parsing",
    updated_at: now,
  });

  try {
    const fileText = await downloadImportFileText(job);
    const parsedFile = await parseImportFile(fileText);

    if (!parsedFile.rows.length) {
      throw new Error(
        `Import file parsed successfully but returned 0 data rows. File: ${job.file_name ?? "unknown"}`
      );
    }

    await resetImportJobData({ importJobId });

    await setImportJobStatus(importJobId, {
      status: "parsing",
      updated_at: new Date().toISOString(),
    });

    const workCandidates: WorkSeedCandidate[] = [];

    const rowsToInsert = parsedFile.rows.map((raw, index) => {
      const canonical = canonicalizeImportRow(raw);
      const normalized = buildNormalizedRow(canonical);

      const status = normalizeRowStatus({
        title: canonical.title,
        isrc: canonical.isrc,
        currency: canonical.currency,
        netAmount: canonical.net_amount,
        grossAmount: canonical.gross_amount,
      });

      const rawTitle = resolveRawTitle(raw, canonical);

      const workCandidate = extractWorkSeedCandidate(canonical);
      if (workCandidate) {
        workCandidates.push(workCandidate);
      }

      return {
        company_id: job.company_id,
        import_id: importJobId,
        import_job_id: importJobId,
        row_number: index + 1,
        status,
        raw,
        canonical,
        normalized,
        raw_title: rawTitle,
        currency: canonical.currency ?? null,
        net_amount: canonical.net_amount ?? null,
        gross_amount: canonical.gross_amount ?? null,
        created_at: now,
        updated_at: now,
      };
    });

    await insertImportRows(rowsToInsert);

    const createdWorkCount = await ensureWorksExistForCandidates({
      companyId: job.company_id,
      candidates: workCandidates,
      now,
    });

    const insertedRowCount = rowsToInsert.length;
    const parsedRowCount = rowsToInsert.filter((row) => row.status === "parsed").length;
    const invalidRowCount = rowsToInsert.filter((row) => row.status === "invalid").length;

    await setImportJobStatus(importJobId, {
      status: "parsed",
      updated_at: new Date().toISOString(),
      row_count: insertedRowCount,
      parsed_row_count: parsedRowCount,
      invalid_row_count: invalidRowCount,
      matched_row_count: 0,
      review_row_count: 0,
    });

    return {
      importJobId,
      insertedRowCount,
      parsedRowCount,
      invalidRowCount,
      createdWorkCount,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error";

    await supabaseAdmin
      .from("import_jobs")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", importJobId);

    throw new Error(message);
  }
}