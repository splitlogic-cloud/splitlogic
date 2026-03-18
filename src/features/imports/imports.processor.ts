import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { finalizeImportProcessing } from "@/features/ingestion/finalizeImportProcessing";

type ImportJobRow = {
  id: string;
  company_id: string;
  file_name?: string | null;
  storage_path?: string | null;
  file_path?: string | null;
  path?: string | null;
  object_path?: string | null;
  status?: string | null;
};

function getImportStorageBucket(): string {
  return (
    process.env.SUPABASE_IMPORTS_BUCKET ||
    process.env.NEXT_PUBLIC_SUPABASE_IMPORTS_BUCKET ||
    "imports"
  );
}

function getStoragePath(job: ImportJobRow): string {
  return (
    job.storage_path ||
    job.file_path ||
    job.path ||
    job.object_path ||
    ""
  );
}

function getFileName(job: ImportJobRow): string {
  return job.file_name || "import.csv";
}

async function safeUpdateImportJob(
  importJobId: string,
  patch: Record<string, unknown>
) {
  const { error } = await supabaseAdmin
    .from("import_jobs")
    .update(patch)
    .eq("id", importJobId);

  if (error) {
    console.error("[imports.processor] failed to update import_jobs", {
      importJobId,
      patch,
      error: error.message,
    });
  }
}

export async function processImportJob(importJobId: string) {
  const { data: importJobData, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("*")
    .eq("id", importJobId)
    .maybeSingle();

  if (importJobError || !importJobData) {
    throw new Error(
      `processImportJob: import job not found (${importJobError?.message ?? "no row"})`
    );
  }

  const importJob = importJobData as ImportJobRow;

  const storagePath = getStoragePath(importJob);
  const fileName = getFileName(importJob);

  if (!storagePath) {
    throw new Error("processImportJob: import job is missing storage path");
  }

  await safeUpdateImportJob(importJobId, {
    status: "processing",
  });

  try {
    // Rensa gamla rows om denna import körs om
    const { error: deleteRowsError } = await supabaseAdmin
      .from("import_rows")
      .delete()
      .eq("import_id", importJobId);

    if (deleteRowsError) {
      throw new Error(
        `processImportJob: failed to clear old import_rows: ${deleteRowsError.message}`
      );
    }

    const bucket = getImportStorageBucket();

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(bucket)
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(
        `processImportJob: failed to download file from storage: ${downloadError?.message ?? "no file"}`
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const result = await finalizeImportProcessing({
      importId: importJobId,
      fileName,
      fileBuffer,
    });

    await safeUpdateImportJob(importJobId, {
      status: "completed",
    });

    console.log("[imports.processor] import completed", {
      importJobId,
      fileName,
      storagePath,
      adapterKey: result.adapterKey,
      sourceName: result.sourceName,
      fileKind: result.fileKind,
      insertedRows: result.insertedRows,
    });

    return result;
  } catch (error) {
    await safeUpdateImportJob(importJobId, {
      status: "failed",
    });

    if (error instanceof Error) {
      console.error("[imports.processor] import failed", {
        importJobId,
        message: error.message,
      });
      throw error;
    }

    throw new Error("processImportJob: unknown failure");
  }
}