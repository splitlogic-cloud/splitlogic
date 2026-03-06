// src/features/parties/parties.repo.ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PartyRow = {
  id: string;
  company_id: string;
  name: string;
  external_id?: string | null;
  ipi?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function listParties(companyId: string, limit = 5000): Promise<PartyRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("parties")
    .select("id,company_id,name,external_id,ipi,created_at,updated_at")
    .eq("company_id", companyId)
    .order("name", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`listParties: ${error.message}`);
  return (data ?? []) as PartyRow[];
}

/**
 * Mini-lista för dropdowns / name mapping i UI.
 * (Det var denna du försökte importera i statements/page.tsx)
 */
export async function listPartiesMini(companyId: string, limit = 5000): Promise<{ id: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("parties")
    .select("id,name")
    .eq("company_id", companyId)
    .order("name", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`listPartiesMini: ${error.message}`);
  return (data ?? []) as { id: string; name: string }[];
}