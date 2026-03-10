import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ImportJobRow = {
  id: string;
  company_id: string;
  filename: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ImportRowRow = {
  id: string;
  import_job_id: string;
  row_index: number | null;
  raw: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | null;
};

export async function listImportJobs(
  companyId: string,
  limit = 100
): Promise<ImportJobRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("import_jobs")
    .select("id, company_id, filename, status, created_at, updated_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`listImportJobs: ${error.message}`);
  }

  return (data ?? []) as ImportJobRow[];
}

export async function getLatestImportJob(
  companyId: string
): Promise<ImportJobRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("import_jobs")
    .select("id, company_id, filename, status, created_at, updated_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getLatestImportJob: ${error.message}`);
  }

  return (data ?? null) as ImportJobRow | null;
}

export async function getImportJobById(
  companyId: string,
  importJobId: string
): Promise<ImportJobRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("import_jobs")
    .select("id, company_id, filename, status, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("id", importJobId)
    .maybeSingle();

  if (error) {
    throw new Error(`getImportJobById: ${error.message}`);
  }

  return (data ?? null) as ImportJobRow | null;
}

export async function listImportRows(
  importJobId: string,
  limit = 500
): Promise<ImportRowRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("import_rows")
    .select("id, import_job_id, row_index, raw, error_code, error_message, created_at")
    .eq("import_job_id", importJobId)
    .order("row_index", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`listImportRows: ${error.message}`);
  }

  return (data ?? []) as ImportRowRow[];
}

export async function deleteLatestImportJob(companyId: string) {
  const supabase = await createClient();

  const latest = await getLatestImportJob(companyId);

  if (!latest) {
    return { deleted: false, reason: "no_latest_import" as const };
  }

  const { error: rowsError } = await supabase
    .from("import_rows")
    .delete()
    .eq("import_job_id", latest.id);

  if (rowsError) {
    throw new Error(`deleteLatestImportJob import_rows: ${rowsError.message}`);
  }

  const { error: jobError } = await supabase
    .from("import_jobs")
    .delete()
    .eq("id", latest.id)
    .eq("company_id", companyId);

  if (jobError) {
    throw new Error(`deleteLatestImportJob import_jobs: ${jobError.message}`);
  }

  return { deleted: true, importJobId: latest.id };
}