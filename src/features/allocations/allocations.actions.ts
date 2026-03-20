"use server";

import { revalidatePath } from "next/cache";
import { createAuditEvent } from "@/features/audit/audit.repo";
import { getCompanyBySlug } from "./allocations.repo";
import { runAllocationForImportJob } from "./allocations.service";

export async function runAllocationAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId.");
  }

  const company = await getCompanyBySlug(companySlug);

  if (!company) {
    throw new Error("Company not found.");
  }

  const result = await runAllocationForImportJob({
    companyId: company.id,
    importJobId,
    createdBy: null,
  });

  await createAuditEvent({
    companyId: company.id,
    entityType: "import_job",
    entityId: importJobId,
    action: "allocation.run.completed",
    payload: {
      allocation_run_id: result.runId,
      input_row_count: result.inputRowCount,
      allocated_row_count: result.allocatedRowCount,
      blocker_count: result.blockerCount,
      gross_amount: result.grossAmount,
      allocated_amount: result.allocatedAmount,
      unallocated_amount: result.unallocatedAmount,
      currency: result.currency,
      engine_version: "v2",
    },
    createdBy: null,
  });

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}