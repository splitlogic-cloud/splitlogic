import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { insertRevenueRows } from "@/features/revenue/revenue.repo";
import { mapImportRowToCanonicalRevenue } from "@/features/revenue/mappers/importRowToCanonical";

async function getSb() {
  const s: any = await (createSupabaseServerClient as any)();
  if (s?.from) return s;
  if (s?.supabase?.from) return s.supabase;
  if (s?.client?.from) return s.client;
  throw new Error("createSupabaseServerClient() did not return a Supabase client");
}

export async function backfillRevenueRowsFromImport(args: {
  companyId: string;
  importId: string;       // THIS is import_rows.import_id
  sourceSystem: string;   // "spotify", "distrokid", etc
}) {
  const supabase = await getSb();

  // 1) Fetch import rows that are valid (error is null)
  const { data: rows, error } = await supabase
    .from("import_rows")
    .select("id,import_id,row_number,raw,normalized,error,warnings")
    .eq("import_id", args.importId)
    .is("error", null)
    .order("row_number", { ascending: true });

  if (error) throw new Error(`Failed to read import_rows: ${error.message}`);
  if (!rows || rows.length === 0) return { inserted: 0, skipped: 0, errors: [] as string[] };

  // 2) Map to canonical revenue rows
  const canonical: any[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    try {
      canonical.push(
        mapImportRowToCanonicalRevenue({
          companyId: args.companyId,
          importId: row.import_id,
          importRowId: row.id,
          rowNumber: row.row_number,
          sourceSystem: args.sourceSystem,
          normalized: row.normalized,
          raw: row.raw,
        })
      );
    } catch (e: any) {
      errors.push(`row_number=${row.row_number} id=${row.id}: ${e.message}`);
    }
  }

  // 3) Insert in batches (avoid payload limits)
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < canonical.length; i += BATCH) {
    const chunk = canonical.slice(i, i + BATCH);
    const res = await insertRevenueRows(chunk);
    inserted += res.count;
  }

  const skipped = rows.length - canonical.length;

  return { inserted, skipped, errors };
}