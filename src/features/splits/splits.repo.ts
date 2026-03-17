import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type SplitRow = {
  id: string;
  company_id: string;
  work_id: string;
  party_id: string;
  role: string | null;
  share_percent: number | string;
  created_at: string;
  updated_at: string;
  party_name?: string | null;
  party_type?: string | null;
};

export async function listSplitsForWork(workId: string) {
  const { data, error } = await supabaseAdmin
    .from("splits")
    .select(`
      id,
      company_id,
      work_id,
      party_id,
      role,
      share_percent,
      created_at,
      updated_at,
      parties:party_id (
        name,
        type
      )
    `)
    .eq("work_id", workId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load splits: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    company_id: row.company_id,
    work_id: row.work_id,
    party_id: row.party_id,
    role: row.role,
    share_percent: row.share_percent,
    created_at: row.created_at,
    updated_at: row.updated_at,
    party_name: row.parties?.name ?? null,
    party_type: row.parties?.type ?? null,
  })) as SplitRow[];
}

export async function listPartiesForCompany(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("parties")
    .select("id, name, type")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load parties: ${error.message}`);
  }

  return data ?? [];
}

export async function getSplitTotalForWork(workId: string) {
  const { data, error } = await supabaseAdmin
    .from("splits")
    .select("share_percent")
    .eq("work_id", workId);

  if (error) {
    throw new Error(`Failed to calculate split total: ${error.message}`);
  }

  const total = (data ?? []).reduce((sum, row: any) => {
    return sum + Number(row.share_percent ?? 0);
  }, 0);

  return total;
}