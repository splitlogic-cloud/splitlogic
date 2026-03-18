import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function listSuggestions(importId: string) {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select(`
      id,
      raw,
      canonical,
      suggestion_confidence,
      works: suggested_work_id ( id, title, artist )
    `)
    .eq("import_id", importId)
    .eq("suggestion_status", "pending");

  if (error) throw new Error(error.message);

  return data ?? [];
}