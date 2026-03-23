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
  source_name?: string | null;
  created_at?: string | null;
};

type WorkBlacklistRow = {
  id: string;
  company_id: string;
  normalized_title: string | null;
  normalized_artist: string | null;
  normalized_isrc: string | null;
  reason?: string | null;
  created_at?: string | null;
};

type WorkRow = {
  id: string;
  normalized_title: string | null;
  normalized_artist: string | null;
  isrc: string | null;
};

type SaveWorkAliasParams = {
  companyId: string;
  workId: string;

  // Legacy/raw inputs still used by existing actions
  title?: string | null;
  artist?: string | null;
  isrc?: string | null;
  sourceName?: string | null;

  // New normalized inputs
  normalizedTitle?: string | null;
  normalizedArtist?: string | null;
  normalizedIsrc?: string | null;
};

type CreateAliasParams = SaveWorkAliasParams;

type AddToBlacklistParams = {
  companyId: string;
  normalizedTitle?: string | null;
  normalizedArtist?: string | null;
  normalizedIsrc?: string | null;

  // legacy compatibility
  title?: string | null;
  artist?: string | null;
  isrc?: string | null;

  reason?: string | null;
};

export function buildAliasKey(title: string, artist: string) {
  return `${title}__${artist}`;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|featuring)\.?\b.*$/gi, " ")
    .replace(
      /\b(remix|mix|edit|version|radio edit|extended|live|mono|stereo)\b/gi,
      " "
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizeIsrcLike(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().trim();
  return cleaned.length > 0 ? cleaned : null;
}

function applyKeyWithBlacklist(
  byKey: Map<string, string>,
  blacklist: Set<string>,
  key: string,
  workId: string
) {
  if (blacklist.has(key)) return;

  const existing = byKey.get(key);
  if (!existing) {
    byKey.set(key, workId);
    return;
  }

  if (existing !== workId) {
    byKey.delete(key);
    blacklist.add(key);
  }
}

function applyIsrcWithBlacklist(
  byIsrc: Map<string, string>,
  blacklist: Set<string>,
  isrc: string,
  workId: string
) {
  const marker = `isrc:${isrc}`;
  if (blacklist.has(marker)) return;

  const existing = byIsrc.get(isrc);
  if (!existing) {
    byIsrc.set(isrc, workId);
    return;
  }

  if (existing !== workId) {
    byIsrc.delete(isrc);
    blacklist.add(marker);
  }
}

function isMissingRelationError(message: string, relationName: string) {
  const lower = message.toLowerCase();
  return lower.includes("relation") && lower.includes(relationName.toLowerCase());
}

function resolveAliasFields(params: SaveWorkAliasParams) {
  const normalizedTitle =
    normalizeNullableString(params.normalizedTitle) ??
    normalizeText(normalizeNullableString(params.title));

  const normalizedArtist =
    normalizeNullableString(params.normalizedArtist) ??
    normalizeText(normalizeNullableString(params.artist));

  const normalizedIsrc =
    normalizeNullableString(params.normalizedIsrc) ??
    normalizeIsrcLike(normalizeNullableString(params.isrc));

  return {
    normalizedTitle,
    normalizedArtist,
    normalizedIsrc,
  };
}

function resolveBlacklistFields(params: AddToBlacklistParams) {
  const normalizedTitle =
    normalizeNullableString(params.normalizedTitle) ??
    normalizeText(normalizeNullableString(params.title));

  const normalizedArtist =
    normalizeNullableString(params.normalizedArtist) ??
    normalizeText(normalizeNullableString(params.artist));

  const normalizedIsrc =
    normalizeNullableString(params.normalizedIsrc) ??
    normalizeIsrcLike(normalizeNullableString(params.isrc));

  return {
    normalizedTitle,
    normalizedArtist,
    normalizedIsrc,
  };
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
    const isrc = normalizeIsrcLike(normalizeNullableString(row.isrc));

    if (!workId) continue;

    if (isrc) {
      applyIsrcWithBlacklist(byIsrc, blacklist, isrc, workId);
    }

    if (!title) continue;

    applyKeyWithBlacklist(byKey, blacklist, title, workId);

    if (artist) {
      applyKeyWithBlacklist(byKey, blacklist, buildAliasKey(title, artist), workId);
    }
  }

  const { data: aliases, error: aliasError } = await supabaseAdmin
    .from("work_aliases")
    .select(
      "id, company_id, work_id, normalized_title, normalized_artist, normalized_isrc, source_name, created_at"
    )
    .eq("company_id", companyId);

  if (aliasError) {
    if (!isMissingRelationError(aliasError.message, "work_aliases")) {
      throw new Error(`Failed to load work aliases: ${aliasError.message}`);
    }
  } else {
    for (const row of (aliases ?? []) as WorkAliasRow[]) {
      const workId = normalizeNullableString(row.work_id);
      const title = normalizeNullableString(row.normalized_title);
      const artist = normalizeNullableString(row.normalized_artist);
      const isrc = normalizeIsrcLike(normalizeNullableString(row.normalized_isrc));

      if (!workId) continue;

      if (isrc) {
        applyIsrcWithBlacklist(byIsrc, blacklist, isrc, workId);
      }

      if (!title) continue;

      applyKeyWithBlacklist(byKey, blacklist, title, workId);

      if (artist) {
        applyKeyWithBlacklist(byKey, blacklist, buildAliasKey(title, artist), workId);
      }
    }
  }

  const { data: blacklistRows, error: blacklistError } = await supabaseAdmin
    .from("work_alias_blacklist")
    .select(
      "id, company_id, normalized_title, normalized_artist, normalized_isrc, reason, created_at"
    )
    .eq("company_id", companyId);

  if (blacklistError) {
    if (!isMissingRelationError(blacklistError.message, "work_alias_blacklist")) {
      throw new Error(`Failed to load work alias blacklist: ${blacklistError.message}`);
    }
  } else {
    for (const row of (blacklistRows ?? []) as WorkBlacklistRow[]) {
      const title = normalizeNullableString(row.normalized_title);
      const artist = normalizeNullableString(row.normalized_artist);
      const isrc = normalizeIsrcLike(normalizeNullableString(row.normalized_isrc));

      if (title) {
        blacklist.add(title);
        byKey.delete(title);
      }

      if (title && artist) {
        const fullKey = buildAliasKey(title, artist);
        blacklist.add(fullKey);
        byKey.delete(fullKey);
      }

      if (isrc) {
        blacklist.add(`isrc:${isrc}`);
        byIsrc.delete(isrc);
      }
    }
  }

  return {
    byKey,
    byIsrc,
    blacklist,
  };
}

export async function saveWorkAlias(params: SaveWorkAliasParams): Promise<void> {
  const companyId = normalizeNullableString(params.companyId);
  const workId = normalizeNullableString(params.workId);
  const sourceName = normalizeNullableString(params.sourceName);

  const { normalizedTitle, normalizedArtist, normalizedIsrc } =
    resolveAliasFields(params);

  if (!companyId) {
    throw new Error("saveWorkAlias requires companyId");
  }

  if (!workId) {
    throw new Error("saveWorkAlias requires workId");
  }

  if (!normalizedTitle) {
    throw new Error("saveWorkAlias requires title or normalizedTitle");
  }

  const payload = {
    company_id: companyId,
    work_id: workId,
    normalized_title: normalizedTitle,
    normalized_artist: normalizedArtist,
    normalized_isrc: normalizedIsrc,
    source_name: sourceName,
  };

  const { error } = await supabaseAdmin.from("work_aliases").upsert(payload, {
    onConflict: "company_id,work_id,normalized_title,normalized_artist",
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(`Failed to save work alias: ${error.message}`);
  }
}

export async function createAlias(params: CreateAliasParams): Promise<void> {
  await saveWorkAlias(params);
}

export async function addToBlacklist(params: AddToBlacklistParams): Promise<void> {
  const companyId = normalizeNullableString(params.companyId);
  const reason = normalizeNullableString(params.reason);

  const { normalizedTitle, normalizedArtist, normalizedIsrc } =
    resolveBlacklistFields(params);

  if (!companyId) {
    throw new Error("addToBlacklist requires companyId");
  }

  if (!normalizedTitle && !normalizedIsrc) {
    throw new Error("addToBlacklist requires title/isrc or normalizedTitle/normalizedIsrc");
  }

  const payload = {
    company_id: companyId,
    normalized_title: normalizedTitle,
    normalized_artist: normalizedArtist,
    normalized_isrc: normalizedIsrc,
    reason,
  };

  const { error } = await supabaseAdmin
    .from("work_alias_blacklist")
    .upsert(payload, {
      onConflict: "company_id,normalized_title,normalized_artist",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Failed to add alias to blacklist: ${error.message}`);
  }
}