import "server-only";

import { runAllocationForImportJob } from "./allocations.service";
import type { AllocationRunResult } from "./allocations-types";

export async function runAllocation(params: {
  companyId: string;
  importJobId: string;
  currency?: string | null;
  createdBy?: string | null;
}): Promise<AllocationRunResult> {
  return runAllocationForImportJob({
    companyId: params.companyId,
    importJobId: params.importJobId,
    currency: params.currency ?? null,
    createdBy: params.createdBy ?? null,
  });
}
