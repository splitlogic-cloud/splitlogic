  // src/lib/supabase/admin.ts
  import "server-only";
  import { createClient } from "@supabase/supabase-js";

  export function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
    if (!key) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // Backwards compatible alias (so older imports keep working)
export const supabaseAdmin = getSupabaseAdmin();