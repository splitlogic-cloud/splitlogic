import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ImportJob = {
  id: string;
  company_id: string;
  status: string;
  created_at: string;

  source?: string | null;
  provider?: string | null;

  storage_bucket?: string | null;
  storage_path?: string | null;

  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  content_sha256?: string | null;

  period_start?: string | null;
  period_end?: string | null;

  error_code?: string | null;
  error_message?: string | null;

  processed_at?: string | null;
};

export type ImportRow = {
  id: string;
  import_id: string;
  row_number: number | null;
  raw: any;
  error: string | null;
  created_at?: string | null;
};

type ListJobsArgs = {
  companyId: string;
  limit?: number;
  offset?: number; // 0-based
  source?: string; // e.g. "masterdata"
};

function assertString(v: unknown, label: string): asserts v is string {
  if (!v || typeof v !== "string") throw new Error(`Missing ${label}`);
}

async function sb() {
  return await createSupabaseServerClient();
}

/* =============================================================================
 * JOBS
 * ========================================================================== */

export async function getImportJobById(importJobId: string): Promise<ImportJob | null> {
  assertString(importJobId, "importJobId");
  const supabase = await sb();

  const { data, error } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", importJobId)
    .maybeSingle();

  if (error) throw new Error(`getImportJobById failed: ${error.message}`);
  return (data ?? null) as ImportJob | null;
}

export async function listImportJobsByCompany(args: ListJobsArgs): Promise<ImportJob[]> {
  assertString(args.companyId, "companyId");
  const supabase = await sb();

  const limit = Math.min(200, Math.max(1, args.limit ?? 20));
  const offset = Math.max(0, args.offset ?? 0);
  const from = offset;
  const to = offset + limit - 1;

  let q = supabase
    .from("import_jobs")
    .select("*")
    .eq("company_id", args.companyId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (args.source) q = q.eq("source", args.source);

  const { data, error } = await q;
  if (error) throw new Error(`listImportJobsByCompany failed: ${error.message}`);
  return (data ?? []) as ImportJob[];
}

export async function listMasterdataImportJobs(companyId: string, limit = 10): Promise<ImportJob[]> {
  return listImportJobsByCompany({ companyId, limit, offset: 0, source: "masterdata" });
}

/* =============================================================================
 * ROWS (import_rows has NO status column; error=null => ok)
 * ========================================================================== */

export async function listImportRows(
  importId: string,
  page = 1,
  pageSize = 50
): Promise<{ rows: ImportRow[]; page: number; pageSize: number; hasNext: boolean }> {
  assertString(importId, "importId");
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

export async function getImportRowCounts(importId: string): Promise<{ ok: number; invalid: number; total: number }> {
  assertString(importId, "importId");
  const supabase = await sb();

  const { count: total, error: totalErr } = await supabase
    .from("import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_id", importId);
  if (totalErr) throw new Error(`getImportRowCounts total failed: ${totalErr.message}`);

  const { count: invalid, error: invErr } = await supabase
    .from("import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_id", importId)
    .not("error", "is", null);
  if (invErr) throw new Error(`getImportRowCounts invalid failed: ${invErr.message}`);

  const t = total ?? 0;
  const inv = invalid ?? 0;
  return { total: t, invalid: inv, ok: t - inv };
}

/* =============================================================================
 * MASTERDATA APPLY/UNDO (RPC)
 * ========================================================================== */

export async function applyMasterdataImport(importJobId: string): Promise<void> {
  assertString(importJobId, "importJobId");
  const supabase = await sb();

  const { error } = await supabase.rpc("masterdata_apply_import", { import_job_id: importJobId });
  if (error) throw new Error(`masterdata_apply_import failed: ${error.message}`);
}

export async function undoMasterdataImport(importJobId: string): Promise<void> {
  assertString(importJobId, "importJobId");
  const supabase = await sb();

  const { error } = await supabase.rpc("masterdata_undo_import", { import_job_id: importJobId });
  if (error) throw new Error(`masterdata_undo_import failed: ${error.message}`);
}