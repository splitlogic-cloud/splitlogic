import "server-only";
import { createClient } from "@/features/supabase/server";

export type WorkRow = {
  id: string;
  company_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export async function listWorks(companyId: string): Promise<WorkRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("works")
    .select("id, company_id, title, created_at, updated_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}