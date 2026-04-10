import { createClient } from "@supabase/supabase-js";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

const { url, key } = requireSupabasePublicEnv();
export const supabase = createClient(
  url,
  key
);
