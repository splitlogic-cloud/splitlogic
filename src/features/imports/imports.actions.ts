"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "imports";

type CreateImportJobAndSignedUploadResult = {
  importId: string;
  storagePath: string;
  uploadUrl: string;
};

function safeFilename(name: string) {
  return (name || "import.csv").replace(/[^\w.\-() ]+/g, "_");
}

/**
 * Canonical: create import job + return signed upload url (Supabase Storage).
 */
export async function createImportJobAndSignedUploadAction(args: {
  companyId: string;
  filename: string;
  contentType?: string;
}): Promise<CreateImportJobAndSignedUploadResult> {
  const { companyId, filename, contentType } = args;

  if (!companyId) throw new Error("companyId is required");
  if (!filename) throw new Error("filename is required");

  const supabase = await createClient();

  // 1) Create import job
  // NOTE: status values must match your DB CHECK constraint.
  // If your allowed set is: uploaded|processing|parsed|failed → keep "uploaded".
  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .insert({
      company_id: companyId,
      status: "uploaded",
      original_filename: filename,
      content_type: contentType ?? null,
    })
    .select("id")
    .single();

  if (jobErr) throw new Error(`create import_jobs failed: ${jobErr.message}`);
  const importId = String(job.id);

  // 2) Deterministic storage path
  const storagePath = `companies/${companyId}/imports/${importId}/${safeFilename(filename)}`;

  // 3) Signed upload URL
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signErr || !signed?.signedUrl) {
    throw new Error(`create signed upload url failed: ${signErr?.message ?? "no signedUrl"}`);
  }

  // 4) Persist storage path (best effort)
  const { error: updErr } = await supabase
    .from("import_jobs")
    .update({ storage_path: storagePath })
    .eq("id", importId);

  if (updErr) {
    // Not fatal for upload, but good to know
    throw new Error(`update import_jobs.storage_path failed: ${updErr.message}`);
  }

  return { importId, storagePath, uploadUrl: signed.signedUrl };
}

/**
 * Backwards-compatible alias some UI might still import.
 */
export async function createImportJobAction(args: {
  companyId: string;
  filename: string;
  contentType?: string;
}) {
  return createImportJobAndSignedUploadAction(args);
}

/**
 * Mark that client finished uploading the file to Storage.
 */
export async function markUploadCompleteAction(args: {
  importId: string;
  storagePath: string;
}) {
  const { importId, storagePath } = args;
  if (!importId) throw new Error("importId is required");
  if (!storagePath) throw new Error("storagePath is required");

  const supabase = await createClient();

  const { error } = await supabase
    .from("import_jobs")
    .update({
      status: "uploaded",
      storage_path: storagePath,
      uploaded_at: new Date().toISOString(),
    })
    .eq("id", importId);

  if (error) throw new Error(`mark upload complete failed: ${error.message}`);
  return { ok: true };
}

/**
 * Parse CSV into import_rows (and/or downstream tables).
 *
 * This function assumes you have ONE of:
 *  - RPC: public.parse_import_csv(p_import_id uuid/text)
 *  - OR you can replace the RPC call with your route handler / edge function.
 */
export async function parseImportCsvAction(args: { importId: string }) {
  const { importId } = args;
  if (!importId) throw new Error("importId is required");

  const supabase = await createClient();

  // set processing
  {
    const { error } = await supabase.from("import_jobs").update({ status: "processing" }).eq("id", importId);
    if (error) throw new Error(`set processing failed: ${error.message}`);
  }

  // Try RPC parse_import_csv
  const { error: rpcErr } = await supabase.rpc("parse_import_csv", { p_import_id: importId });

  if (rpcErr) {
    await supabase.from("import_jobs").update({ status: "failed" }).eq("id", importId);
    throw new Error(`parse_import_csv failed: ${rpcErr.message}`);
  }

  // If your RPC completes parsing synchronously, mark parsed
  // If async/background, you may want to leave it as processing.
  await supabase.from("import_jobs").update({ status: "parsed" }).eq("id", importId);

  return { ok: true };
}

/**
 * Delete a specific import job + its rows.
 * This is the correct action for a Delete button on /imports/[importJobId].
 */
export async function deleteImportAction(args: { companyId: string; importId: string }) {
  const { companyId, importId } = args;
  if (!companyId) throw new Error("companyId is required");
  if (!importId) throw new Error("importId is required");

  const supabase = await createClient();

  // Load job to verify ownership (optional but recommended)
  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .select("id, company_id, storage_path")
    .eq("id", importId)
    .maybeSingle();

  if (jobErr) throw new Error(`load import failed: ${jobErr.message}`);
  if (!job) return { ok: true };

  if (String(job.company_id) !== String(companyId)) {
    throw new Error("Import does not belong to this company.");
  }

  // Delete rows first
  const { error: rowsErr } = await supabase.from("import_rows").delete().eq("import_id", importId);
  if (rowsErr) throw new Error(`delete import_rows failed: ${rowsErr.message}`);

  // Delete job
  const { error: delErr } = await supabase.from("import_jobs").delete().eq("id", importId);
  if (delErr) throw new Error(`delete import_jobs failed: ${delErr.message}`);

  // Optional: also delete the file from Storage (best effort)
  // NOTE: needs bucket policy allowing delete, otherwise skip.
  if (job.storage_path) {
    await supabase.storage.from(BUCKET).remove([job.storage_path]).catch(() => {});
  }

  return { ok: true };
}

/**
 * Backwards compatible name used by older UI.
 * Accepts either:
 *  - { companyId, importId }  -> deletes that import
 *  - { companyId }            -> deletes latest import for company
 */
export async function deleteLatestImportAction(args: { companyId: string; importId?: string }) {
  const supabase = await createClient();

  if (args.importId) {
    return deleteImportAction({ companyId: args.companyId, importId: args.importId });
  }

  // No importId provided => delete latest
  const { data: latest, error: latestErr } = await supabase
    .from("import_jobs")
    .select("id")
    .eq("company_id", args.companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) throw new Error(`load latest import failed: ${latestErr.message}`);
  if (!latest?.id) return { ok: true };

  return deleteImportAction({ companyId: args.companyId, importId: String(latest.id) });
}

////////////////////////////////////////////////////////////////////////////////
// UNDO LATEST IMPORT
////////////////////////////////////////////////////////////////////////////////

export async function undoLatestImportAction(args: { companyId: string }) {
  const { companyId } = args;

  if (!companyId) throw new Error("companyId is required");

  const supabase = await createClient();

  // hämta senaste importen
  const { data: latest, error } = await supabase
    .from("import_jobs")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`load latest import failed: ${error.message}`);
  if (!latest?.id) return { ok: true };

  // kör undo
  const { data, error: undoErr } = await supabase.rpc("undo_import", {
    p_import_id: latest.id,
  });

  if (undoErr) throw new Error(`undo_import failed: ${undoErr.message}`);

  return data ?? { ok: true };
}