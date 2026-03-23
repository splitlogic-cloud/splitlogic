import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

type LoadParams = {
  companyId: string;
  keys: string[];
  isrcs: string[];
};

type WorkAliasRow = {
  id: string;
  company_id: string;
  work_id: string;
  normalized_title: string;
  normalized_artist: string | null;
  normalized_isrc: string | null;
  created_at?: string | null;
};

type WorkRow = {
  id: string;
  normalized_title: string | null;
  normalized_artist: string | null;
  isrc: string | null;
};

export function buildAliasKey(title: string, artist: string) {
  return `${title}__${artist}`;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function loadWorkAliasIndexForCandidates({
  companyId,
}: LoadParams): Promise<{
  byKey: Map<string, string>;
  byIsrc: Map<string, string>;
  blacklist: Set<string>;
}> {
  const byKey = new Map<string, string>();
  const byIsrc = new Map<string, string>();
  const blacklist = new Set<string>();

  const { data: works, error: worksError } = await supabaseAdmin
    .from("works")
    .select("id, normalized_title, normalized_artist, isrc")
    .eq("company_id", companyId);

  if (worksError) {
    throw new Error(`Failed to load works for alias index: ${worksError.message}`);
  }

  for (const row of (works ?? []) as WorkRow[]) {
    const workId = normalizeNullableString(row.id);
    const title = normalizeNullableString(row.normalized_title);
    const artist = normalizeNullableString(row.normalized_artist);
    const isrc = normalizeNullableString(row.isrc);

    if (!workId) continue;

    if (isrc) {
      if (!byIsrc.has(isrc)) {
        byIsrc.set(isrc, workId);
      } else if (byIsrc.get(isrc) !== workId) {
        blacklist.add(`isrc:${isrc}`);
      }
    }

    if (!title) continue;

    if (!byKey.has(title)) {
      byKey.set(title, workId);
    } else if (byKey.get(title) !== workId) {
      blacklist.add(title);
    }

    if (artist) {
      const fullKey = buildAliasKey(title, artist);

      if (!byKey.has(fullKey)) {
        byKey.set(fullKey, workId);
      } else if (byKey.get(fullKey) !== workId) {
        blacklist.add(fullKey);
      }
    }
  }

  const { data: aliases, error: aliasError } = await supabaseAdmin
    .from("work_aliases")
    .select(
      "id, company_id, work_id, normalized_title, normalized_artist, normalized_isrc, created_at"
    )
    .eq("company_id", companyId);

  if (aliasError) {
    const message = aliasError.message.toLowerCase();
    const missingTable =
      message.includes("relation") && message.includes("work_aliases");

    if (!missingTable) {
      throw new Error(`Failed to load work aliases: ${aliasError.message}`);
    }
  } else {
    for (const row of (aliases ?? []) as WorkAliasRow[]) {
      const workId = normalizeNullableString(row.work_id);
      const title = normalizeNullableString(row.normalized_title);
      const artist = normalizeNullableString(row.normalized_artist);
      const isrc = normalizeNullableString(row.normalized_isrc);

      if (!workId) continue;

      if (isrc) {
        if (!byIsrc.has(isrc)) {
          byIsrc.set(isrc, workId);
        } else if (byIsrc.get(isrc) !== workId) {
          blacklist.add(`isrc:${isrc}`);
        }
      }

      if (!title) continue;

      if (!byKey.has(title)) {
        byKey.set(title, workId);
      } else if (byKey.get(title) !== workId) {
        blacklist.add(title);
      }

      if (artist) {
        const fullKey = buildAliasKey(title, artist);

        if (!byKey.has(fullKey)) {
          byKey.set(fullKey, workId);
        } else if (byKey.get(fullKey) !== workId) {
          blacklist.add(fullKey);
        }
      }
    }
  }

  for (const key of blacklist) {
    if (key.startsWith("isrc:")) {
      const isrc = key.slice(5);
      byIsrc.delete(isrc);
    } else {
      byKey.delete(key);
    }
  }

  return {
    byKey,
    byIsrc,
    blacklist,
  };
}

export async function saveWorkAlias(params: {
  companyId: string;
  workId: string;
  normalizedTitle: string;
  normalizedArtist?: string | null;
  normalizedIsrc?: string | null;
}): Promise<void> {
  const companyId = normalizeNullableString(params.companyId);
  const workId = normalizeNullableString(params.workId);
  const normalizedTitle = normalizeNullableString(params.normalizedTitle);
  const normalizedArtist = normalizeNullableString(params.normalizedArtist);
  const normalizedIsrc = normalizeNullableString(params.normalizedIsrc);

  if (!companyId) {
    throw new Error("saveWorkAlias requires companyId");
  }

  if (!workId) {
    throw new Error("saveWorkAlias requires workId");
  }

  if (!normalizedTitle) {
    throw new Error("saveWorkAlias requires normalizedTitle");
  }

  const payload = {
    company_id: companyId,
    work_id: workId,
    normalized_title: normalizedTitle,
    normalized_artist: normalizedArtist,
    normalized_isrc: normalizedIsrc,
  };

  const { error } = await supabaseAdmin.from("work_aliases").upsert(payload, {
    onConflict: "company_id,work_id,normalized_title,normalized_artist",
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(`Failed to save work alias: ${error.message}`);
  }
}