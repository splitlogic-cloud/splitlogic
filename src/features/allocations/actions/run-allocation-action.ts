"use server";

import type { AllocationRunResult } from "../allocations-types";
import { runAllocationForImportJob } from "../allocations.service";

export async function runAllocation(params: {
  companyId: string;
  importJobId: string;
  createdBy?: string | null;
  currency?: string | null;
}): Promise<AllocationRunResult> {
  return runAllocationForImportJob({
    companyId: params.companyId,
    importJobId: params.importJobId,
    createdBy: params.createdBy ?? null,
    currency: params.currency ?? null,
  });
}
