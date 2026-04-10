// src/lib/supabase/server.ts
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseServerEnv } from "@/lib/supabase/env";

export async function createClient() {
  const { url, key } = requireSupabaseServerEnv();

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll kan faila i vissa server contexts (t.ex. RSC). Okej.
        }
      },
    },
  });
}

// ✅ Bakåtkompatibilitet (så dina imports fortsätter funka)
export const createSupabaseServerClient = createClient;