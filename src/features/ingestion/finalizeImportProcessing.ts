import "server-only";
import { backfillRevenueRowsFromImport } from "@/features/revenue/backfillFromImport.repo";

/**
 * Call this EXACTLY ONCE when an import is successfully processed.
 * Safe to call multiple times thanks to revenue_rows unique + upsert.
 */
export async function finalizeImportProcessing(args: {
  companyId: string;
  importId: string;       // import_rows.import_id
  sourceSystem: string;   // "spotify", "distrokid", ...
}) {
  // Materialize canonical revenue rows from normalized import rows
  const result = await backfillRevenueRowsFromImport({
    companyId: args.companyId,
    importId: args.importId,
    sourceSystem: args.sourceSystem,
  });

  // If we got mapping errors, treat as a hard failure (so job should not be "processed")
  if (result.errors.length > 0 && result.inserted === 0) {
    throw new Error(
      `finalizeImportProcessing: mapping failed. Example: ${result.errors[0]}`
    );
  }

  return result;
}