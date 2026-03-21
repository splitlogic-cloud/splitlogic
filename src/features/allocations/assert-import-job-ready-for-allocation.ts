import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function assertImportJobReadyForAllocation(importJobId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("import_rows")
    .select("status")
    .eq("import_job_id", importJobId);

  if (error || !data) {
    throw new Error(`Failed to verify allocation readiness: ${error?.message ?? "unknown"}`);
  }

  const invalid = data.filter((row) => row.status === "invalid").length;
  const needsReview = data.filter((row) => row.status === "needs_review").length;
  const unmatched = data.filter((row) => row.status === "unmatched").length;
  const matched = data.filter((row) => row.status === "matched").length;

  if (invalid > 0 || needsReview > 0 || unmatched > 0 || matched === 0) {
    throw new Error(
      `Allocation blocked. invalid=${invalid}, needs_review=${needsReview}, unmatched=${unmatched}, matched=${matched}`,
    );
  }
}