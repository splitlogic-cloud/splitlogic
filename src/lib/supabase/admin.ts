// src/lib/supabase/admin.ts
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  _admin = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return _admin;
}

/** Lazy så Next.js build (route module load) inte kräver Supabase-env förrän något anropas. */
function createLazyAdminClient(): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop, _receiver) {
      const client = getSupabaseAdmin();
      const value = Reflect.get(client, prop, client);
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    },
  });
}

// ✅ Bakåtkompatibilitet (så dina imports fortsätter funka)
export const supabaseAdmin = createLazyAdminClient();