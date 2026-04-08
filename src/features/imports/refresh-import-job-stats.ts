import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

type ImportRowAggregateRecord = {
  status: string | null;
  allocation_status: string | null;
  work_id?: string | null;
  matched_work_id?: string | null;
};

function isAllocatedAllocationStatus(value: string | null | undefined): boolean {
  return value === "allocated" || value === "completed";
}

async function listAllImportRowAggregates(
  importJobId: string
): Promise<ImportRowAggregateRecord[]> {
  const pageSize = 1000;
  const rows: ImportRowAggregateRecord[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabaseAdmin
      .from("import_rows")
      .select("status, allocation_status, work_id, matched_work_id")
      .or(`import_job_id.eq.${importJobId},import_id.eq.${importJobId}`)
      .range(from, to);

    if (error) {
      throw new Error(`Failed to reload import row aggregates: ${error.message}`);
    }

    const batch = (data ?? []) as ImportRowAggregateRecord[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

export async function refreshImportJobStatsByImportJobId(
  importJobId: string
): Promise<void> {
  const rows = await listAllImportRowAggregates(importJobId);

  let totalRowCount = 0;
  let parsedRowCount = 0;
  let invalidRowCount = 0;
  let matchedRowCount = 0;
  let reviewRowCount = 0;
  let allocatedRowCount = 0;

  for (const row of rows) {
    totalRowCount += 1;

    const status = row.status ?? null;
    const allocationStatus = row.allocation_status ?? null;
    const hasMatch = row.work_id != null || row.matched_work_id != null || status === "matched";
    const isAllocated = isAllocatedAllocationStatus(allocationStatus);

    if (status === "invalid") {
      invalidRowCount += 1;
      continue;
    }

    if (status === "needs_review" || status === "unmatched") {
      reviewRowCount += 1;
      continue;
    }

    if (isAllocated || status === "allocated") {
      allocatedRowCount += 1;
      continue;
    }

    if (hasMatch) {
      matchedRowCount += 1;
      continue;
    }

    if (status === "parsed") {
      parsedRowCount += 1;
      continue;
    }
  }

  let nextStatus = "uploaded";

  if (totalRowCount === 0) {
    nextStatus = "uploaded";
  } else if (allocatedRowCount === totalRowCount) {
    nextStatus = "completed";
  } else if (matchedRowCount > 0) {
    nextStatus = "matched";
  } else {
    nextStatus = "parsed";
  }

  const { error: updateError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: nextStatus,
      row_count: totalRowCount,
      parsed_row_count: parsedRowCount,
      invalid_row_count: invalidRowCount,
      matched_row_count: matchedRowCount,
      review_row_count: reviewRowCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", importJobId);

  if (updateError) {
    throw new Error(`Failed to update import job aggregates: ${updateError.message}`);
  }
}
