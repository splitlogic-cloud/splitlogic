// src/lib/supabase/admin.ts
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseServiceRoleEnv } from "@/lib/supabase/env";

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;

  const { url, serviceRoleKey } = requireSupabaseServiceRoleEnv();

  _admin = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return _admin;
}

// Lazy proxy avoids crashing module evaluation at build-time when env vars
// are missing in the build environment. Calls still fail at runtime if env
// vars are not configured.
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});