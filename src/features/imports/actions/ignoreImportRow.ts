"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function ignoreImportRow(
  rowId: string,
  companySlug: string,
  importId: string
) {
  const { error } = await supabaseAdmin
    .from("import_rows")
    .update({
      allocation_decision: "ignored",
    })
    .eq("id", rowId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/c/${companySlug}/imports/${importId}`);
}