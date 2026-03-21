import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function readImportJobFile(filePath: string): Promise<string> {
  const bucket = "imports";

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .download(filePath);

  if (error || !data) {
    throw new Error(`download import file failed: ${error?.message ?? "unknown"}`);
  }

  return await data.text();
}