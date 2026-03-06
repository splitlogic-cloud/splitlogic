import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function listAudit(companyId: string, limit = 200) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, metadata, actor_user_id, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}