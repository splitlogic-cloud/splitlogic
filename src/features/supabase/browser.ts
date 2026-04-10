import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

export function createSupabaseBrowser() {
  const { url, key } = requireSupabasePublicEnv();

  return createBrowserClient(
    url,
    key
  );
}
