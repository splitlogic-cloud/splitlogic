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

type WorkSplitRow = {
  id: string;
  company_id: string;
  work_id: string;
  party_id: string;
  role: string | null;
  share_percent: number | string | null;
  share_basis: string | null;
  territory_scope: "worldwide" | "region" | "country" | null;
  territory_code: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};

type PartyRow = {
  id: string;
  name: string | null;
};

export async function listWorkSplits(workId: string): Promise<WorkSplitListRow[]> {
  const supabase = await createClient();

  const { data: splits, error: splitsError } = await supabase
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
      updated_at
    `)
    .eq("work_id", workId)
    .order("created_at", { ascending: true });

  if (splitsError) {
    throw new Error(`listWorkSplits: ${splitsError.message}`);
  }

  const typedSplits = (splits ?? []) as WorkSplitRow[];

  const partyIds = [...new Set(typedSplits.map((row) => row.party_id).filter(Boolean))];

  let partiesById = new Map<string, string | null>();

  if (partyIds.length > 0) {
    const { data: parties, error: partiesError } = await supabase
      .from("parties")
      .select("id, name")
      .in("id", partyIds);

    if (partiesError) {
      throw new Error(`listWorkSplits parties lookup: ${partiesError.message}`);
    }

    partiesById = new Map(
      ((parties ?? []) as PartyRow[]).map((party) => [party.id, party.name ?? null])
    );
  }

  return typedSplits.map((row) => ({
    id: row.id,
    company_id: row.company_id,
    work_id: row.work_id,
    party_id: row.party_id,
    role: row.role ?? "owner",
    share_percent: Number(row.share_percent ?? 0),
    share_basis: row.share_basis ?? "net",
    territory_scope: (row.territory_scope ?? "worldwide") as
      | "worldwide"
      | "region"
      | "country",
    territory_code: row.territory_code,
    start_date: row.start_date,
    end_date: row.end_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    party_name: partiesById.get(row.party_id) ?? null,
  }));
}