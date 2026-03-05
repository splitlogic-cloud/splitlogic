import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ImportJob = {
  id: string;
  company_id: string;
  status: string | null;
  created_at: string | null;
  storage_path?: string | null;
  original_filename?: string | null;
};

export type ImportRow = {
  id: string;
  import_id: string;
  row_number: number | null;
  raw: any;
  error: string | null;
  status?: string | null;
  created_at?: string | null;
};

export async function getImportJobById(importId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("import_jobs")
    .select("id, company_id, status, created_at, storage_path, original_filename")
    .eq("id", importId)
    .maybeSingle();

  if (error) throw new Error(`getImportJobById failed: ${error.message}`);
  return data as ImportJob | null;
}

export async function listImportRows(importId: string, page = 1, pageSize = 50) {
  const supabase = await createClient();

  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("import_rows")
    .select("id, import_id, row_number, raw, error, status, created_at", { count: "exact" })
    .eq("import_id", importId)
    .order("row_number", { ascending: true })
    .range(from, to);

  if (error) throw new Error(`listImportRows failed: ${error.message}`);

  return {
    rows: (data ?? []) as ImportRow[],
    count: count ?? null,
    page,
    pageSize,
  };
}