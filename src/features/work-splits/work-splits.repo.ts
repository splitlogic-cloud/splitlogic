import "server-only";
import { createClient } from "@/lib/supabase/server";

export type WorkSplitListRow = {
  id: string;
  company_id: string;
  work_id: string;
  party_id: string;
  role: string;
  share_percent: number;
  share_basis: string;
  territory_scope: "worldwide" | "region" | "country";
  territory_code: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  party_name: string | null;
};

export async function listWorkSplits(workId: string): Promise<WorkSplitListRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("work_splits")
    .select(`
      id,
      company_id,
      work_id,
      party_id,
      role,
      share_percent,
      share_basis,
      territory_scope,
      territory_code,
      start_date,
      end_date,
      created_at,
      updated_at,
      parties:party_id (
        name
      )
    `)
    .eq("work_id", workId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`listWorkSplits: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    company_id: row.company_id,
    work_id: row.work_id,
    party_id: row.party_id,
    role: row.role,
    share_percent: Number(row.share_percent),
    share_basis: row.share_basis,
    territory_scope: row.territory_scope,
    territory_code: row.territory_code,
    start_date: row.start_date,
    end_date: row.end_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    party_name: row.parties?.name ?? null,
  }));
}