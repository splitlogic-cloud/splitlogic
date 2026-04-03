"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAllocationRun, computeAllocationRunSummary } from "./allocations.repo";
import type { AllocationRunResult } from "./allocations-types";

export async function runAllocationForImportJob(params: {
  companyId: string;
  importJobId: string;
  createdBy?: string | null;
  currency?: string | null;
}): Promise<AllocationRunResult> {
  const currency = params.currency ?? null;

  // Skapa allocation run
  const allocationRun = await createAllocationRun({
    companyId: params.companyId,
    importJobId: params.importJobId,
    currency,
    createdBy: params.createdBy ?? null,
  });

  // Beräkna summary för allocation
  const summary = await computeAllocationRunSummary({
    allocationRunId: allocationRun.id,
    companyId: params.companyId,
    importJobId: params.importJobId,
  });

  return {
    runId: allocationRun.id,
    inputRowCount: summary.inputRowCount,
    allocatedRowCount: summary.allocatedRowCount,
    blockerCount: summary.blockerCount,
    grossAmount: summary.grossAmountTotal,
    allocatedAmount: summary.allocatedAmountTotal,
    unallocatedAmount: summary.unallocatedAmountTotal,
    currency,
  };
}