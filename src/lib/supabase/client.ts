"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (client) return client;

  const { url, key } = requireSupabasePublicEnv();

  client = createBrowserClient(url, key);

  return client;
}

/**
 * Backwards compatibility
 * Your app imports this name
 */
export const createSupabaseBrowserClient = createClient;