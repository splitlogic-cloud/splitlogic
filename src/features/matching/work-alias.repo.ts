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

  // blacklist först
  const { data: blocked } = await supabaseAdmin
    .from("work_alias_blacklist")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("key", k)
    .maybeSingle();

  if (blocked) return null;

  const { data } = await supabaseAdmin
    .from("work_aliases")
    .select("work_id")
    .eq("company_id", params.companyId)
    .eq("key", k)
    .maybeSingle();

  if (data?.work_id) return data.work_id;

  if (params.isrc) {
    const isrc = normalizeIsrc(params.isrc);

    const { data: isrcMatch } = await supabaseAdmin
      .from("work_aliases")
      .select("work_id")
      .eq("company_id", params.companyId)
      .eq("isrc", isrc)
      .maybeSingle();

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
}) {
  const k = key(params.title, params.artist);

  await supabaseAdmin.from("work_aliases").upsert(
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
}

export async function addToBlacklist(params: {
  companyId: string;
  title: string;
  artist: string;
}) {
  const k = key(params.title, params.artist);

  await supabaseAdmin.from("work_alias_blacklist").upsert(
    {
      company_id: params.companyId,
      key: k,
    },
    { onConflict: "company_id,key" }
  );
}