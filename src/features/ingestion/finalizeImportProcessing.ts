import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { detectImportSource } from "./detect-source";
import { getAdapterByKey } from "./registry";
import { parseDelimitedText } from "./parse-delimited";
import { parseWorkbook } from "./parse-xlsx";
import { AdapterContext, FileKind } from "./types";

function getFileKind(fileName: string): FileKind {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".txt") || lower.endsWith(".tsv")) return "txt";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  if (lower.endsWith(".pdf")) return "pdf";

  return "unknown";
}

function bufferToUtf8(buffer: Buffer): string {
  return buffer.toString("utf8");
}

export async function finalizeImportProcessing(args: {
  importId: string;
  fileName: string;
  fileBuffer: Buffer;
}) {
  const fileKind = getFileKind(args.fileName);

  if (fileKind === "pdf") {
    throw new Error(
      "PDF ingestion is not enabled yet in this version. Use CSV/XLSX/TXT first."
    );
  }

  let ctx: AdapterContext;

  if (fileKind === "xlsx") {
    const parsed = parseWorkbook(args.fileBuffer);

    ctx = {
      fileKind,
      fileName: args.fileName,
      headers: parsed.headers,
      rows: parsed.rows,
      headerRowIndex: parsed.headerRowIndex,
    };
  } else {
    const parsed = parseDelimitedText(bufferToUtf8(args.fileBuffer));

    ctx = {
      fileKind,
      fileName: args.fileName,
      headers: parsed.headers,
      rows: parsed.rows,
      headerRowIndex: parsed.headerRowIndex,
    };
  }

  const detected = detectImportSource(ctx);
  const adapter = getAdapterByKey(detected.adapterKey);

  if (!adapter) {
    throw new Error(`No adapter found for key: ${detected.adapterKey}`);
  }

  const normalizedRows = adapter.normalize(ctx);

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", args.importId)
    .maybeSingle();

  if (importJobError || !importJob) {
    throw new Error("Import job not found");
  }

  const rowsToInsert = normalizedRows.map((row, index) => ({
    import_id: args.importId,
    row_number: index + 1,
    raw: row.raw,
    canonical: row.canonical,
    source_name: row.canonical.source_name,
    source_file_type: row.canonical.source_file_type,
    adapter_key: detected.adapterKey,
  }));

  if (rowsToInsert.length > 0) {
    const chunkSize = 1000;

    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize);

      const { error } = await supabaseAdmin.from("import_rows").insert(chunk);

      if (error) {
        throw new Error(`insert normalized import rows failed: ${error.message}`);
      }
    }
  }

  const { error: sourceProfileError } = await supabaseAdmin
    .from("import_source_profiles")
    .insert({
      company_id: importJob.company_id,
      source_name: detected.sourceName ?? "Unknown",
      adapter_key: detected.adapterKey,
      file_type: fileKind,
      header_row_index: ctx.headerRowIndex,
      column_map: Object.fromEntries(
        ctx.headers.map((header, index) => [String(index), header])
      ),
    });

  if (sourceProfileError) {
    throw new Error(`save source profile failed: ${sourceProfileError.message}`);
  }

  return {
    adapterKey: detected.adapterKey,
    sourceName: detected.sourceName,
    fileKind,
    insertedRows: rowsToInsert.length,
  };
}