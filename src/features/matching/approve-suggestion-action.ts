"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAlias } from "./work-alias.repo";
import { revalidatePath } from "next/cache";

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function approveSuggestion(formData: FormData) {
  const rowId = String(formData.get("rowId"));
  const workId = String(formData.get("workId"));
  const companySlug = String(formData.get("companySlug"));
  const importId = String(formData.get("importId"));

  const { data: row } = await supabaseAdmin
    .from("import_rows")
    .select("raw, canonical")
    .eq("id", rowId)
    .maybeSingle();

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .maybeSingle();

  await supabaseAdmin
    .from("import_rows")
    .update({
      matched_work_id: workId,
      match_confidence: 1,
      match_source: "alias_auto",
      suggestion_status: "approved",
    })
    .eq("id", rowId);

  if (row && company) {
    const title =
      pick(row.canonical, ["title"]) ||
      pick(row.raw, ["title", "track"]);

    const artist =
      pick(row.canonical, ["artist"]) ||
      pick(row.raw, ["artist"]);

    const isrc =
      pick(row.canonical, ["isrc"]) ||
      pick(row.raw, ["isrc"]);

    if (title && artist) {
      await createAlias({
        companyId: company.id,
        workId,
        title,
        artist,
        isrc: isrc || null,
      });
    }
  }

  revalidatePath(`/c/${companySlug}/matching/suggestions?importId=${importId}`);
}