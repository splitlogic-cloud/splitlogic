import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeArtist, normalizeIsrc, normalizeText } from "./normalize";

function key(title: string, artist: string) {
  return `${normalizeText(title)}__${normalizeArtist(artist)}`;
}

export async function findWorkByAlias(params: {
  companyId: string;
  title: string;
  artist: string;
  isrc: string | null;
}) {
  const k = key(params.title, params.artist);

  const { data: blocked, error: blockedError } = await supabaseAdmin
    .from("work_alias_blacklist")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("key", k)
    .maybeSingle();

  if (blockedError) {
    throw new Error(`findWorkByAlias blacklist lookup failed: ${blockedError.message}`);
  }

  if (blocked) return null;

  const { data, error } = await supabaseAdmin
    .from("work_aliases")
    .select("work_id")
    .eq("company_id", params.companyId)
    .eq("key", k)
    .maybeSingle();

  if (error) {
    throw new Error(`findWorkByAlias key lookup failed: ${error.message}`);
  }

  if (data?.work_id) return data.work_id;

  if (params.isrc) {
    const isrc = normalizeIsrc(params.isrc);

    const { data: isrcMatch, error: isrcError } = await supabaseAdmin
      .from("work_aliases")
      .select("work_id")
      .eq("company_id", params.companyId)
      .eq("isrc", isrc)
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
  const k = key(params.title, params.artist);

  const { error } = await supabaseAdmin.from("work_aliases").upsert(
    {
      company_id: params.companyId,
      work_id: params.workId,
      key: k,
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
  const k = key(params.title, params.artist);

  const { error } = await supabaseAdmin.from("work_alias_blacklist").upsert(
    {
      company_id: params.companyId,
      key: k,
    },
    { onConflict: "company_id,key" }
  );

  if (error) {
    throw new Error(`addToBlacklist failed: ${error.message}`);
  }
}