"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runImportParse } from "@/features/imports/run-import-parse";
import { matchImportRowsForImport } from "@/features/imports/imports.matching";
import { saveWorkAlias } from "@/features/matching/work-alias.repo";

type CompanyRecord = {
  id: string;
  slug: string | null;
};

type ImportJobRecord = {
  id: string;
  company_id: string;
};

type ImportRowRecord = {
  id: string;
  import_id: string | null;
  import_job_id: string | null;
  raw: Record<string, unknown> | null;
};

function pickString(raw: Record<string, unknown> | null, keys: string[]): string {
  if (!raw) return "";

  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

async function verifyContext(params: {
  companySlug: string;
  importJobId: string;
}) {
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", params.companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  const typedCompany = company as CompanyRecord;

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", params.importJobId)
    .eq("company_id", typedCompany.id)
    .maybeSingle();

  if (importJobError || !importJob) {
    throw new Error("Import job not found");
  }

  return {
    company: typedCompany,
    importJob: importJob as ImportJobRecord,
  };
}

export async function runImportParseAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId");
  }

  await verifyContext({ companySlug, importJobId });
  await runImportParse(importJobId);

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}

export async function runMatchingAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId");
  }

  const { company } = await verifyContext({
    companySlug,
    importJobId,
  });

  const { error: setStatusError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: "matching",
      updated_at: new Date().toISOString(),
    })
    .eq("id", importJobId);

  if (setStatusError) {
    throw new Error(`Failed to set import job to matching: ${setStatusError.message}`);
  }

  try {
    await matchImportRowsForImport({
      companyId: company.id,
      importJobId,
    });
  } catch (error) {
    await supabaseAdmin
      .from("import_jobs")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", importJobId);

    throw error;
  }

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}

export async function manualMatchImportRowAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");
  const rowId = String(formData.get("rowId") ?? "");
  const workId = String(formData.get("workId") ?? "");

  if (!companySlug || !importJobId || !rowId || !workId) {
    throw new Error("Missing companySlug, importJobId, rowId or workId");
  }

  const { company, importJob } = await verifyContext({
    companySlug,
    importJobId,
  });

  const { data: importRow, error: importRowError } = await supabaseAdmin
    .from("import_rows")
    .select("id, import_id, import_job_id, raw")
    .eq("id", rowId)
    .or(`import_job_id.eq.${importJob.id},import_id.eq.${importJob.id}`)
    .maybeSingle();

  if (importRowError || !importRow) {
    throw new Error("Import row not found");
  }

  const typedImportRow = importRow as ImportRowRecord;

  const { error: updateError } = await supabaseAdmin
    .from("import_rows")
    .update({
      work_id: workId,
      matched_work_id: workId,
      match_source: "manual",
      match_confidence: 1,
      status: "matched",
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId)
    .or(`import_job_id.eq.${importJob.id},import_id.eq.${importJob.id}`);

  if (updateError) {
    throw new Error(`manual match failed: ${updateError.message}`);
  }

  const raw = typedImportRow.raw ?? {};

  const title = pickString(raw, [
    "title",
    "track",
    "track_title",
    "trackTitle",
    "song_title",
    "songTitle",
    "product",
    "release_title",
    "releaseTitle",
    "work_title",
  ]);

  const artist = pickString(raw, [
    "artist",
    "track_artist",
    "trackArtist",
    "product_artist",
    "productArtist",
    "main_artist",
    "mainArtist",
    "artist_name",
  ]);

  const isrc = pickString(raw, ["isrc", "ISRC", "isrc_code", "track_isrc"]);
  const sourceName = pickString(raw, ["store", "service", "source_name", "source", "platform"]);

  if (title || artist || isrc) {
    await saveWorkAlias({
      companyId: company.id,
      workId,
      title,
      artist,
      isrc: isrc || null,
      sourceName: sourceName || null,
    });
  }

  const { data: aggregates, error: aggregateError } = await supabaseAdmin
    .from("import_rows")
    .select("status, work_id")
    .eq("import_job_id", importJob.id);

  if (aggregateError) {
    throw new Error(`Failed to reload import row aggregates: ${aggregateError.message}`);
  }

  const parsedRowCount = (aggregates ?? []).filter((row) => row.status === "parsed").length;
  const invalidRowCount = (aggregates ?? []).filter((row) => row.status === "invalid").length;
  const matchedRowCount = (aggregates ?? []).filter((row) => row.work_id != null).length;
  const reviewRowCount = (aggregates ?? []).filter(
    (row) => row.status === "needs_review"
  ).length;

  await supabaseAdmin
    .from("import_jobs")
    .update({
      status: matchedRowCount > 0 ? "matched" : "parsed",
      parsed_row_count: parsedRowCount,
      invalid_row_count: invalidRowCount,
      matched_row_count: matchedRowCount,
      review_row_count: reviewRowCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", importJob.id);

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}

export async function clearImportRowMatchAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");
  const rowId = String(formData.get("rowId") ?? "");

  if (!companySlug || !importJobId || !rowId) {
    throw new Error("Missing companySlug, importJobId or rowId");
  }

  const { importJob } = await verifyContext({
    companySlug,
    importJobId,
  });

  const { error } = await supabaseAdmin
    .from("import_rows")
    .update({
      work_id: null,
      matched_work_id: null,
      match_source: null,
      match_confidence: 0,
      status: "needs_review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId)
    .or(`import_job_id.eq.${importJob.id},import_id.eq.${importJob.id}`);

  if (error) {
    throw new Error(`clear match failed: ${error.message}`);
  }

  const { data: aggregates, error: aggregateError } = await supabaseAdmin
    .from("import_rows")
    .select("status, work_id")
    .eq("import_job_id", importJob.id);

  if (aggregateError) {
    throw new Error(`Failed to reload import row aggregates: ${aggregateError.message}`);
  }

  const parsedRowCount = (aggregates ?? []).filter((row) => row.status === "parsed").length;
  const invalidRowCount = (aggregates ?? []).filter((row) => row.status === "invalid").length;
  const matchedRowCount = (aggregates ?? []).filter((row) => row.work_id != null).length;
  const reviewRowCount = (aggregates ?? []).filter(
    (row) => row.status === "needs_review"
  ).length;

  await supabaseAdmin
    .from("import_jobs")
    .update({
      status: matchedRowCount > 0 ? "matched" : "parsed",
      parsed_row_count: parsedRowCount,
      invalid_row_count: invalidRowCount,
      matched_row_count: matchedRowCount,
      review_row_count: reviewRowCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", importJob.id);

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}