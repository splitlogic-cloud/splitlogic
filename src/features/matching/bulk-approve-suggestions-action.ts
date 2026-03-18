"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAlias } from "@/features/matching/work-alias.repo";

function pick(obj: any, keys: string[]): string {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return "";
}

export async function bulkApprove(formData: FormData) {
  const rawIds = String(formData.get("ids") ?? "");
  const companyId = String(formData.get("companyId") ?? "");
  const companySlug = String(formData.get("companySlug") ?? "");
  const importId = String(formData.get("importId") ?? "");

  const ids = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!companyId || !companySlug || !importId || ids.length === 0) {
    throw new Error("Missing ids, companyId, companySlug or importId");
  }

  const { data: rows, error } = await supabaseAdmin
    .from("import_rows")
    .select("id, raw, canonical, suggested_work_id")
    .in("id", ids);

  if (error) {
    throw new Error(`bulkApprove load rows failed: ${error.message}`);
  }

  for (const row of rows ?? []) {
    const suggestedWorkId = row.suggested_work_id;
    if (!suggestedWorkId) continue;

    const { error: updateError } = await supabaseAdmin
      .from("import_rows")
      .update({
        matched_work_id: suggestedWorkId,
        match_confidence: 1,
        match_source: "alias_auto",
        suggestion_status: "approved",
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(`bulkApprove update failed: ${updateError.message}`);
    }

    const canonical = row.canonical || {};
    const raw = row.raw || {};

    const title =
      pick(canonical, ["title"]) ||
      pick(raw, ["title", "track", "track_title"]);

    const artist =
      pick(canonical, ["artist"]) ||
      pick(raw, ["artist", "track_artist"]);

    const isrc =
      pick(canonical, ["isrc"]) ||
      pick(raw, ["isrc", "ISRC"]);

    if (title && artist) {
      await createAlias({
        companyId,
        workId: suggestedWorkId,
        title,
        artist,
        isrc: isrc || null,
      });
    }
  }

  revalidatePath(`/c/${companySlug}/matching/suggestions?importId=${importId}`);
}