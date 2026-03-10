import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseCsvText } from "./imports.parser";

type ImportJobForProcessing = {
  id: string;
  company_id: string;
  filename: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  status: string | null;
};

export async function processImportJob(importJobId: string) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id, filename, storage_bucket, storage_path, status")
    .eq("id", importJobId)
    .maybeSingle();

  if (jobError) {
    throw new Error(`processImportJob load job: ${jobError.message}`);
  }

  if (!job) {
    throw new Error("Import job not found");
  }

  const typedJob = job as ImportJobForProcessing;

  if (!typedJob.storage_bucket || !typedJob.storage_path) {
    throw new Error("Import job is missing storage location");
  }

  const { error: setProcessingError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", typedJob.id);

  if (setProcessingError) {
    throw new Error(`set processing status: ${setProcessingError.message}`);
  }

  try {
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(typedJob.storage_bucket)
      .download(typedJob.storage_path);

    if (downloadError || !fileData) {
      throw new Error(downloadError?.message ?? "Could not download file from storage");
    }

    const text = await fileData.text();
    const parsedRows = parseCsvText(text);

    const { error: deleteError } = await supabaseAdmin
      .from("import_rows")
      .delete()
      .eq("import_job_id", typedJob.id);

    if (deleteError) {
      throw new Error(`delete existing import_rows: ${deleteError.message}`);
    }

    if (parsedRows.length > 0) {
      const rowsToInsert = parsedRows.map((row) => ({
        import_job_id: typedJob.id,
        row_index: row.rowIndex,
        raw: row.raw,
      }));

      const { error: insertError } = await supabaseAdmin
        .from("import_rows")
        .insert(rowsToInsert);

      if (insertError) {
        throw new Error(`insert import_rows: ${insertError.message}`);
      }
    }

    const { error: updateDoneError } = await supabaseAdmin
      .from("import_jobs")
      .update({
        status: "processed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", typedJob.id);

    if (updateDoneError) {
      throw new Error(`update import_jobs after processing: ${updateDoneError.message}`);
    }

    return {
      ok: true,
      totalRows: parsedRows.length,
      status: "processed",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown processing error";

    await supabaseAdmin
      .from("import_jobs")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", typedJob.id);

    throw new Error(message);
  }
}