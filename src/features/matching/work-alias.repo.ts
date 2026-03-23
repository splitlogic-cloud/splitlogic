import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export function buildAliasKey(title: string, artist: string) {
  return `${title}__${artist}`;
}

type LoadParams = {
  companyId: string;
  keys: string[];
  isrcs: string[];
};

export async function loadWorkAliasIndexForCandidates({
  companyId,
}: LoadParams) {
  const { data, error } = await supabaseAdmin
    .from("works")
    .select("id, normalized_title, normalized_artist, isrc")
    .eq("company_id", companyId);

  if (error) {
    throw new Error(`Failed to load works: ${error.message}`);
  }

  const byKey = new Map<string, string>();
  const byIsrc = new Map<string, string>();
  const blacklist = new Set<string>();

  for (const row of data ?? []) {
    const workId = row.id;
    const title = row.normalized_title;
    const artist = row.normalized_artist;
    const isrc = row.isrc;

    // ISRC
    if (isrc) {
      if (!byIsrc.has(isrc)) {
        byIsrc.set(isrc, workId);
      }
    }

    if (!title) continue;

    // 1️⃣ title-only key
    if (!byKey.has(title)) {
      byKey.set(title, workId);
    } else {
      blacklist.add(title); // duplicate → risky
    }

    // 2️⃣ title + artist key (only if artist exists)
    if (artist) {
      const fullKey = buildAliasKey(title, artist);

      if (!byKey.has(fullKey)) {
        byKey.set(fullKey, workId);
      } else {
        blacklist.add(fullKey);
      }
    }
  }

  return {
    byKey,
    byIsrc,
    blacklist,
  };
}