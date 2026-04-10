import { createClient } from "@supabase/supabase-js";
import { requireSupabaseServiceRoleEnv } from "@/lib/supabase/env";

const { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey } =
  requireSupabaseServiceRoleEnv();

// Viktigt: service role endast server-side
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);