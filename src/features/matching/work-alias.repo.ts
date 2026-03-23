import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeArtist, normalizeIsrc, normalizeText } from "./normalize";

export type WorkAliasRow = {
  work_id: string;
  key: string | null;
  isrc: string | null;
};

export type WorkAliasBlacklistRow = {
  key: string;
};

export function buildAliasKey(title: string, artist: string) {
  return `${normalizeText(title)}__${normalizeArtist(artist)}`;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

export async function loadWorkAliasIndexForCandidates(params: {
  companyId: string;
  keys: string[];
  isrcs: string[];
}): Promise<{
  byKey: Map<string, string>;
  byIsrc: Map<string, string>;
  blacklist: Set<string>;
}> {
  const keys = uniqueNonEmpty(params.keys);
  const isrcs = uniqueNonEmpty(params.isrcs.map((value) => normalizeIsrc(value)));

  const aliasQueries: PromiseLike<{
    data: WorkAliasRow[] | null;
    error: { message: string } | null;
  }>[] = [];

  if (keys.length > 0) {
    aliasQueries.push(
      supabaseAdmin
        .from("work_aliases")
        .select("work_id, key, isrc")
        .eq("company_id", params.companyId)
        .in("key", keys)
        .limit(Math.max(keys.length * 5, 100))
    );
  }

  if (isrcs.length > 0) {
    aliasQueries.push(
      supabaseAdmin
        .from("work_aliases")
        .select("work_id, key, isrc")
        .eq("company_id", params.companyId)
        .in("isrc", isrcs)
        .limit(Math.max(isrcs.length * 5, 100))
    );
  }

  const blacklistPromise =
    keys.length > 0
      ? supabaseAdmin
          .from("work_alias_blacklist")
          .select("key")
          .eq("company_id", params.companyId)
          .in("key", keys)
          .limit(Math.max(keys.length * 2, 100))
      : Promise.resolve({ data: [] as WorkAliasBlacklistRow[], error: null });

  const [aliasResults, blacklistResult] = await Promise.all([
    Promise.all(aliasQueries),
    blacklistPromise,
  ]);

  const byKey = new Map<string, string>();
  const byIsrc = new Map<string, string>();
  const blacklist = new Set<string>();

  for (const result of aliasResults) {
    if (result.error) {
      throw new Error(`loadWorkAliasIndexForCandidates aliases lookup failed: ${result.error.message}`);
    }

    for (const row of (result.data ?? []) as WorkAliasRow[]) {
      if (row.key && row.work_id && !byKey.has(row.key)) {
        byKey.set(row.key, row.work_id);
      }

      if (row.isrc && row.work_id) {
        const normalized = normalizeIsrc(row.isrc);
        if (normalized && !byIsrc.has(normalized)) {
          byIsrc.set(normalized, row.work_id);
        }
      }
    }
  }

  if (blacklistResult.error) {
    throw new Error(
      `loadWorkAliasIndexForCandidates blacklist lookup failed: ${blacklistResult.error.message}`
    );
  }

  for (const row of (blacklistResult.data ?? []) as WorkAliasBlacklistRow[]) {
    if (row.key) {
      blacklist.add(row.key);
    }
  }

  return {
    byKey,
    byIsrc,
    blacklist,
  };
}

export async function findWorkByAlias(params: {
  companyId: string;
  title: string;
  artist: string;
  isrc: string | null;
}) {
  const aliasKey = buildAliasKey(params.title, params.artist);

  const { data: blocked, error: blockedError } = await supabaseAdmin
    .from("work_alias_blacklist")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("key", aliasKey)
    .maybeSingle();

  if (blockedError) {
    throw new Error(`findWorkByAlias blacklist lookup failed: ${blockedError.message}`);
  }

  if (blocked) return null;

  const { data, error } = await supabaseAdmin
    .from("work_aliases")
    .select("work_id")
    .eq("company_id", params.companyId)
    .eq("key", aliasKey)
    .maybeSingle();

  if (error) {
    throw new Error(`findWorkByAlias key lookup failed: ${error.message}`);
  }

  if (data?.work_id) return data.work_id;

  if (params.isrc) {
    const normalized = normalizeIsrc(params.isrc);

    const { data: isrcMatch, error: isrcError } = await supabaseAdmin
      .from("work_aliases")
      .select("work_id")
      .eq("company_id", params.companyId)
      .eq("isrc", normalized)
      .maybeSingle();

    if (isrcError) {
      throw new Error(`findWorkByAlias ISRC lookup failed: ${isrcError.message}`);
    }

    if (isrcMatch?.work_id) return isrcMatch.work_id;
  }

  return null;
}

export async function createAlias(params: {
  companyId: string;
  workId: string;
  title: string;
  artist: string;
  isrc: string | null;
  sourceName?: string | null;
}) {
  const aliasKey = buildAliasKey(params.title, params.artist);

  const { error } = await supabaseAdmin.from("work_aliases").upsert(
    {
      company_id: params.companyId,
      work_id: params.workId,
      key: aliasKey,
      title: normalizeText(params.title),
      artist: normalizeArtist(params.artist),
      isrc: params.isrc ? normalizeIsrc(params.isrc) : null,
    },
    { onConflict: "company_id,key" }
  );

  if (error) {
    throw new Error(`createAlias failed: ${error.message}`);
  }
}

export async function saveWorkAlias(params: {
  companyId: string;
  workId: string;
  title: string;
  artist: string;
  isrc: string | null;
  sourceName?: string | null;
}) {
  return createAlias(params);
}

export async function addToBlacklist(params: {
  companyId: string;
  title: string;
  artist: string;
}) {
  const aliasKey = buildAliasKey(params.title, params.artist);

  const { error } = await supabaseAdmin.from("work_alias_blacklist").upsert(
    {
      company_id: params.companyId,
      key: aliasKey,
    },
    { onConflict: "company_id,key" }
  );

  if (error) {
    throw new Error(`addToBlacklist failed: ${error.message}`);
  }
}