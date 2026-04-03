// src/lib/supabase/types.ts
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type ImportRowsTableRow = {
  id: string;
  company_id: string;
  import_job_id: string;
  work_id: string | null;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  currency: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  status: string;
  raw_payload: Record<string, unknown>;
  normalized_payload: Record<string, unknown>;
};

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          slug: string;
        };
        Insert: { id?: string; name: string; slug: string };
        Update: { id?: string; name?: string; slug?: string };
      };
      import_jobs: {
        Row: {
          id: string;
          company_id: string;
          file_name: string | null;
          status: string | null;
          created_at: string;
        };
        Insert: { id?: string; company_id: string; file_name?: string | null; status?: string | null };
        Update: { file_name?: string | null; status?: string | null };
      };
      import_rows: {
        Row: ImportRowsTableRow;
        Insert: Omit<ImportRowsTableRow, "id"> & { id?: string };
        Update: Partial<Omit<ImportRowsTableRow, "id">>;
      };
    };
  };
}