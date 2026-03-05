// src/lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * Browser/client-side Supabase client (singleton).
 * - Safe to use in Client Components
 * - Uses NEXT_PUBLIC_* env vars
 */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  browserClient = createBrowserClient(url, anon);
  return browserClient;
}

/**
 * Backwards-compatible export name used across the app.
 * Your code imports: createSupabaseBrowserClient
 */
export const createSupabaseBrowserClient = createClient;