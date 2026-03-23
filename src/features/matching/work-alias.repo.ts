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

export async function loadWorkAliasIndex(companyId: string): Promise<{
  byKey: Map<string, string>;
  byIsrc: Map<string, string>;
  blacklist: Set<string>;
}> {
  const [{ data: aliases, error: aliasesError }, { data: blacklist, error: blacklistError }] =
    await Promise.all([
      supabaseAdmin
        .from("work_aliases")
        .select("work_id, key, isrc")
        .eq("company_id", companyId)
        .limit(100000),
      supabaseAdmin
        .from("work_alias_blacklist")
        .select("key")
        .eq("company_id", companyId)
        .limit(100000),
    ]);

  if (aliasesError) {
    throw new Error(`loadWorkAliasIndex aliases lookup failed: ${aliasesError.message}`);
  }

  if (blacklistError) {
    throw new Error(`loadWorkAliasIndex blacklist lookup failed: ${blacklistError.message}`);
  }

  const byKey = new Map<string, string>();
  const byIsrc = new Map<string, string>();
  const blacklistSet = new Set<string>();

  for (const row of (aliases ?? []) as WorkAliasRow[]) {
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

  for (const row of (blacklist ?? []) as WorkAliasBlacklistRow[]) {
    if (row.key) {
      blacklistSet.add(row.key);
    }
  }

  return {
    byKey,
    byIsrc,
    blacklist: blacklistSet,
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