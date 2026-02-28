// src/features/imports/imports.repo.ts
import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * NOTE:
 * - Den här filen är skriven för att vara "schema-tolerant" så långt det går.
 * - Den antar MINST att du har:
 *   - public.import_jobs: id (uuid/text), company_id, status, created_at (+ ev counts/warnings/metadata)
 *   - public.import_rows: id, import_id, row_number, raw (jsonb), error (text), status, created_at
 * - All access sker via Supabase RLS (du har redan company isolation + membership enforcement).
 *
 * Om din DB har andra kolumnnamn kan du behöva justera select/update payloads.
 */

export type ImportJob = {
  id: string;
  company_id: string;
  status?: string | null;
  created_at?: string | null;

  // valfria om du har dem
  kind?: string | null;
  ok_count?: number | null;
  invalid_count?: number | null;
  total_count?: number | null;
  warnings?: string[] | any;
  metadata?: any;
  storage_path?: string | null;
  file_name?: string | null;
};

export type ImportRow = {
  id: string;
  import_id: string;
  row_number?: number | null;
  status?: string | null;
  error?: string | null;
  raw?: any; // jsonb
  created_at?: string | null;
};

function assertId(id: string, label: string) {
  if (!id || typeof id !== "string") throw new Error(`Missing ${label}`);
}

async function sb() {
  return await createSupabaseServerClient();

}

/* =============================================================================
 * JOBS (read)
 * ========================================================================== */

export async function getImportJobById(importJobId: string): Promise<ImportJob | null> {
  assertId(importJobId, "importJobId");
  const supabase = await sb();

  const { data, error } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", importJobId)
    .maybeSingle();

  if (error) throw new Error(`getImportJobById failed: ${error.message}`);
  return (data ?? null) as ImportJob | null;
}

export async function listImportJobsByCompany(companyId: string, limit = 20): Promise<ImportJob[]> {
  assertId(companyId, "companyId");
  const supabase = await sb();

  const { data, error } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listImportJobsByCompany failed: ${error.message}`);
  return (data ?? []) as ImportJob[];
}

/**
 * Den du tidigare hade i /imports-sidan (admin-lista).
 * Behåller namnet så dina imports-page imports inte kraschar.
 */
export async function listImportJobsByCompanyAdmin(companyId: string, limit = 20): Promise<ImportJob[]> {
  return listImportJobsByCompany(companyId, limit);
}

/* =============================================================================
 * JOBS (masterdata convenience)
 * ========================================================================== */

export async function listMasterdataImportJobs(companyId: string, limit = 10): Promise<ImportJob[]> {
  // Om du har kolumn "kind" kan du filtrera här.
  // Jag filtrerar INTE hårt, för att inte spräcka om kolumn saknas.
  // Vill du: uncomment och se till att kolumnen finns.
  //
  // .eq("kind", "masterdata")

  return listImportJobsByCompany(companyId, limit);
}

/* =============================================================================
 * JOBS (create/update)
 * ========================================================================== */

export type CreateImportJobInput = {
  company_id: string;
  status?: string; // e.g. 'created'
  kind?: string; // e.g. 'masterdata' | 'transactions'
  storage_path?: string | null;
  file_name?: string | null;
  metadata?: any;
};

export async function createImportJob(input: CreateImportJobInput): Promise<ImportJob> {
  assertId(input.company_id, "company_id");
  const supabase = await sb();

  const insertPayload: any = {
    company_id: input.company_id,
    status: input.status ?? "created",
  };

  // Valfria fält (bara sätt om definierade)
  if (input.kind !== undefined) insertPayload.kind = input.kind;
  if (input.storage_path !== undefined) insertPayload.storage_path = input.storage_path;
  if (input.file_name !== undefined) insertPayload.file_name = input.file_name;
  if (input.metadata !== undefined) insertPayload.metadata = input.metadata;

  const { data, error } = await supabase
    .from("import_jobs")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) throw new Error(`createImportJob failed: ${error.message}`);
  return data as ImportJob;
}

export async function setImportJobStatus(importJobId: string, status: string, extra?: Partial<ImportJob>) {
  assertId(importJobId, "importJobId");
  const supabase = await sb();

  const patch: any = { status };
  if (extra) {
    // försiktig merge — skicka bara "enkla" fields som sannolikt finns
    if (extra.ok_count !== undefined) patch.ok_count = extra.ok_count;
    if (extra.invalid_count !== undefined) patch.invalid_count = extra.invalid_count;
    if (extra.total_count !== undefined) patch.total_count = extra.total_count;
    if (extra.warnings !== undefined) patch.warnings = extra.warnings;
    if (extra.metadata !== undefined) patch.metadata = extra.metadata;
    if (extra.storage_path !== undefined) patch.storage_path = extra.storage_path;
    if (extra.file_name !== undefined) patch.file_name = extra.file_name;
    if (extra.kind !== undefined) patch.kind = extra.kind;
  }

  const { error } = await supabase.from("import_jobs").update(patch).eq("id", importJobId);
  if (error) throw new Error(`setImportJobStatus(${status}) failed: ${error.message}`);
}

export async function setImportJobProcessing(importJobId: string, extra?: Partial<ImportJob>) {
  return setImportJobStatus(importJobId, "processing", extra);
}

export async function setImportJobCompleted(importJobId: string, extra?: Partial<ImportJob>) {
  return setImportJobStatus(importJobId, "completed", extra);
}

export async function setImportJobFailed(importJobId: string, errorMessage: string, extra?: Partial<ImportJob>) {
  // Lägg gärna errorMessage i metadata om du vill.
  const mergedExtra: Partial<ImportJob> = {
    ...(extra ?? {}),
    metadata: {
      ...(extra?.metadata ?? {}),
      error: errorMessage,
    },
  };
  return setImportJobStatus(importJobId, "failed", mergedExtra);
}

/* =============================================================================
 * ROWS (read)
 * ========================================================================== */

export async function listImportRows(
  importId: string,
  page = 1,
  pageSize = 50
): Promise<{ rows: ImportRow[]; page: number; pageSize: number; hasNext: boolean }> {
  assertId(importId, "importId");
  const supabase = await sb();

  const safePage = Math.max(1, page);
  const safeSize = Math.min(200, Math.max(10, pageSize));
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  const { data, error } = await supabase
    .from("import_rows")
    .select("*")
    .eq("import_id", importId)
    .order("row_number", { ascending: true })
    .range(from, to);

  if (error) throw new Error(`listImportRows failed: ${error.message}`);

  const rows = (data ?? []) as ImportRow[];
  return { rows, page: safePage, pageSize: safeSize, hasNext: rows.length === safeSize };
}

export async function getImportRowById(importRowId: string): Promise<ImportRow | null> {
  assertId(importRowId, "importRowId");
  const supabase = await sb();

  const { data, error } = await supabase.from("import_rows").select("*").eq("id", importRowId).maybeSingle();
  if (error) throw new Error(`getImportRowById failed: ${error.message}`);
  return (data ?? null) as ImportRow | null;
}

/* =============================================================================
 * ROWS (insert/update)
 * ========================================================================== */

export type InsertImportRow = {
  import_id: string;
  row_number: number;
  raw: any;
  status?: string | null; // 'ok' | 'invalid' | 'warning' ...
  error?: string | null;
};

export async function insertImportRowsBatch(rows: InsertImportRow[], chunkSize = 500): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const supabase = await sb();

  const safeChunk = Math.min(1000, Math.max(50, chunkSize));
  for (let i = 0; i < rows.length; i += safeChunk) {
    const chunk = rows.slice(i, i + safeChunk).map((r) => ({
      import_id: r.import_id,
      row_number: r.row_number,
      raw: r.raw,
      status: r.status ?? (r.error ? "invalid" : "ok"),
      error: r.error ?? null,
    }));

    const { error } = await supabase.from("import_rows").insert(chunk);
    if (error) throw new Error(`insertImportRowsBatch failed: ${error.message}`);
  }
}

export async function setImportRowError(importRowId: string, errorMessage: string): Promise<void> {
  assertId(importRowId, "importRowId");
  const supabase = await sb();

  const { error } = await supabase
    .from("import_rows")
    .update({ status: "invalid", error: errorMessage })
    .eq("id", importRowId);

  if (error) throw new Error(`setImportRowError failed: ${error.message}`);
}

export async function markImportRowOk(importRowId: string): Promise<void> {
  assertId(importRowId, "importRowId");
  const supabase = await sb();

  const { error } = await supabase.from("import_rows").update({ status: "ok", error: null }).eq("id", importRowId);
  if (error) throw new Error(`markImportRowOk failed: ${error.message}`);
}

export async function deleteImportRowsByImportId(importId: string): Promise<void> {
  assertId(importId, "importId");
  const supabase = await sb();

  const { error } = await supabase.from("import_rows").delete().eq("import_id", importId);
  if (error) throw new Error(`deleteImportRowsByImportId failed: ${error.message}`);
}

/* =============================================================================
 * MASTERDATA APPLY/UNDO (RPC)
 * ========================================================================== */

export async function applyMasterdataImport(importJobId: string): Promise<void> {
  assertId(importJobId, "importJobId");
  const supabase = await sb();

  const { error } = await supabase.rpc("masterdata_apply_import", {
    import_job_id: importJobId,
  });

  if (error) throw new Error(`masterdata_apply_import failed: ${error.message}`);
}

export async function undoMasterdataImport(importJobId: string): Promise<void> {
  assertId(importJobId, "importJobId");
  const supabase = await sb();

  const { error } = await supabase.rpc("masterdata_undo_import", {
    import_job_id: importJobId,
  });

  if (error) throw new Error(`masterdata_undo_import failed: ${error.message}`);
}

/* =============================================================================
 * OPTIONAL: counts helper (om du vill uppdatera counts efter parsing)
 * ========================================================================== */

export type ImportCounts = {
  ok: number;
  invalid: number;
  total: number;
  warnings?: string[];
};

export async function setImportJobCounts(importJobId: string, counts: ImportCounts): Promise<void> {
  assertId(importJobId, "importJobId");
  const supabase = await sb();

  const patch: any = {
    ok_count: counts.ok,
    invalid_count: counts.invalid,
    total_count: counts.total,
  };

  if (counts.warnings !== undefined) patch.warnings = counts.warnings;

  const { error } = await supabase.from("import_jobs").update(patch).eq("id", importJobId);
  if (error) throw new Error(`setImportJobCounts failed: ${error.message}`);
}