"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/features/supabase/server";
import {
  normalizeIsrc,
  normalizeText,
  buildTitleArtistKey,
} from "@/features/works/work-matching";

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

export async function createWorkAction(formData: FormData) {
  const supabase = await createClient();

  const companySlug = clean(formData.get("companySlug"));
  const companyId = clean(formData.get("company_id"));
  const title = clean(formData.get("title"));
  const artist = clean(formData.get("artist"));
  const isrc = normalizeIsrc(clean(formData.get("isrc")));

  if (!companyId) {
    throw new Error("Missing company_id");
  }

  if (!companySlug) {
    throw new Error("Missing companySlug");
  }

  if (!title) {
    throw new Error("Title is required");
  }

  const normalizedTitle = normalizeText(title);
  const normalizedArtist = normalizeText(artist);
  const normalizedIsrc = normalizeIsrc(isrc);
  const normalizedTitleArtist = buildTitleArtistKey(title, artist);

  const { error } = await supabase.from("works").insert({
    company_id: companyId,
    title,
    artist: artist || null,
    isrc: isrc || null,
    normalized_title: normalizedTitle,
    normalized_artist: normalizedArtist || null,
    normalized_isrc: normalizedIsrc || null,
    normalized_title_artist: normalizedTitleArtist,
  });

  if (error) {
    throw new Error(error.message);
  }

  redirect(`/c/${companySlug}/works`);
}

export async function updateWorkAction() {
  throw new Error("updateWorkAction not implemented yet.");
}