import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function listWorks(companyId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("works")
    .select("id, external_id, title, iswc, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getWork(companyId: string, id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("works")
    .select("id, external_id, title, iswc")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function createWork(companyId: string, input: { external_id?: string; title: string; iswc?: string; }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("works").insert({
    company_id: companyId,
    external_id: input.external_id || null,
    title: input.title,
    iswc: input.iswc || null,
  });
  if (error) throw new Error(error.message);
}

export async function updateWork(companyId: string, id: string, input: { external_id?: string; title: string; iswc?: string; }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("works")
    .update({
      external_id: input.external_id || null,
      title: input.title,
      iswc: input.iswc || null,
    })
    .eq("company_id", companyId)
    .eq("id", id);

  if (error) throw new Error(error.message);
}