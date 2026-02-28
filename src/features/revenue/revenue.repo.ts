import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getSb() {
  const s: any = await (createSupabaseServerClient as any)();
  if (s?.from) return s;
  if (s?.supabase?.from) return s.supabase;
  if (s?.client?.from) return s.client;
  throw new Error("createSupabaseServerClient() did not return a Supabase client");
}

export type CanonicalRevenueRowInsert = {
  company_id: string;

  import_job_id?: string | null;
  import_row_id?: string | null;

  source_system: string;
  source_file_id?: string | null;
  source_row_number?: number | null;

  event_date: string; // YYYY-MM-DD
  territory?: string | null;
  currency: string;
  quantity?: number | null;

  amount_gross?: number | null;
  amount_net: number;

  work_id?: string | null;
  work_ref?: string | null;
  external_track_id?: string | null;

  raw_row_json: any;
};

export async function insertRevenueRows(rows: CanonicalRevenueRowInsert[]) {
    if (rows.length === 0) return { count: 0 };
  
    const supabase = await getSb();
  
    // Upsert on (company_id, import_row_id)
    const { error } = await supabase
      .from("revenue_rows")
      .upsert(rows, { onConflict: "company_id,import_row_id" });
  
    if (error) throw new Error(`insertRevenueRows failed: ${error.message}`);
  
    return { count: rows.length };
  }

export async function listRevenueRowsForPeriod(args: {
  companyId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
}) {
  const supabase = await getSb();

  const { data, error } = await supabase
    .from("revenue_rows")
    .select(
      "id,event_date,source_system,source_file_id,source_row_number,territory,currency,quantity,amount_gross,amount_net,work_id,work_ref,external_track_id"
    )
    .eq("company_id", args.companyId)
    .gte("event_date", args.periodStart)
    .lte("event_date", args.periodEnd)
    .order("event_date", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(`listRevenueRowsForPeriod failed: ${error.message}`);
  return data ?? [];
}