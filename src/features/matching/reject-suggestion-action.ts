"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { addToBlacklist } from "./work-alias.repo";
import { revalidatePath } from "next/cache";

function pick(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function rejectSuggestion(formData: FormData) {
  const rowId = String(formData.get("rowId"));
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
      suggestion_status: "rejected",
    })
    .eq("id", rowId);

  if (row && company) {
    const title =
      pick(row.canonical, ["title"]) ||
      pick(row.raw, ["title"]);

    const artist =
      pick(row.canonical, ["artist"]) ||
      pick(row.raw, ["artist"]);

    if (title && artist) {
      await addToBlacklist({
        companyId: company.id,
        title,
        artist,
      });
    }
  }

  revalidatePath(`/c/${companySlug}/matching/suggestions?importId=${importId}`);
}