import "server-only";

import { runAllocationForImportJob } from "./allocations.service";

export type AllocationRunResult = {
  allocationRunId: string;
};

export async function runAllocation(params: {
  companyId: string;
  importJobId: string;
  currency?: string | null;
  createdBy?: string | null;
}): Promise<AllocationRunResult> {
  const result = await runAllocationForImportJob({
    companyId: params.companyId,
    importJobId: params.importJobId,
    currency: params.currency ?? null,
    createdBy: params.createdBy ?? null,
  });

  return {
    allocationRunId: result.runId,
  };
}