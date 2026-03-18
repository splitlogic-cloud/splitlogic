import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { findWorkByAlias } from "./work-alias.repo";

export async function matchImportRowsForImport(params: {
  companyId: string;
  importId: string;
}) {
  const { data: rows } = await supabaseAdmin
    .from("import_rows")
    .select("*")
    .eq("import_id", params.importId);

  const { data: works } = await supabaseAdmin
    .from("works")
    .select("*")
    .eq("company_id", params.companyId);

  for (const row of rows ?? []) {
    const title = row.canonical?.title || row.raw?.title;
    const artist = row.canonical?.artist || row.raw?.artist;
    const isrc = row.canonical?.isrc || row.raw?.isrc;

    const alias = await findWorkByAlias({
      companyId: params.companyId,
      title,
      artist,
      isrc,
    });

    if (alias) {
      await supabaseAdmin
        .from("import_rows")
        .update({
          matched_work_id: alias,
          match_confidence: 1,
        })
        .eq("id", row.id);
    }
  }
}