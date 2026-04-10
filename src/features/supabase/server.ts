import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseServerEnv } from "@/lib/supabase/env";

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  const { url, key } = requireSupabaseServerEnv();

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // ok
          }
        },
      },
    }
  );
}

export { createSupabaseServer as createClient };