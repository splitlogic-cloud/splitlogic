"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
  import_id: string;
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
    .select("id, import_id, raw")
    .eq("id", rowId)
    .eq("import_id", importJob.id)
    .maybeSingle();

  if (importRowError || !importRow) {
    throw new Error("Import row not found");
  }

  const typedImportRow = importRow as ImportRowRecord;

  const { error: updateError } = await supabaseAdmin
    .from("import_rows")
    .update({
      matched_work_id: workId,
      match_source: "manual",
      match_confidence: 1,
    })
    .eq("id", rowId)
    .eq("import_id", importJob.id);

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
  ]);

  const artist = pickString(raw, [
    "artist",
    "track_artist",
    "trackArtist",
    "product_artist",
    "productArtist",
    "main_artist",
    "mainArtist",
  ]);

  const isrc = pickString(raw, ["isrc", "ISRC"]);
  const sourceName = pickString(raw, ["store", "service", "source_name", "source"]);

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
      matched_work_id: null,
      match_source: null,
      match_confidence: null,
    })
    .eq("id", rowId)
    .eq("import_id", importJob.id);

  if (error) {
    throw new Error(`clear match failed: ${error.message}`);
  }

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}