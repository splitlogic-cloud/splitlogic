"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function manualMatchWork({
  importRowId,
  workId,
  companySlug,
  importJobId,
}: {
  importRowId: string;
  workId: string;
  companySlug: string;
  importJobId: string;
}) {

  const { error } = await supabaseAdmin
    .from("import_rows")
    .update({
      matched_work_id: workId,
      match_source: "manual",
      match_confidence: 1,
    })
    .eq("id", importRowId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}