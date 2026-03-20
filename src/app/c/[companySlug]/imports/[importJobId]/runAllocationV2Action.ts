"use server";

import { revalidatePath } from "next/cache";
import {
  createAllocationRun,
  failAllocationRun,
  finishAllocationRun,
  getCompanyBySlug,
  getImportJobById,
  listActiveAllocationRules,
  listImportRowsForAllocation,
  replaceAllocationRunLines,
} from "@/features/allocations/allocations.repo";
import { runAllocationV2 } from "@/features/allocations/run-allocation-v2";

export async function runAllocationV2Action(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "").trim();
  const importJobId = String(formData.get("importJobId") ?? "").trim();

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId");
  }

  const company = await getCompanyBySlug(companySlug);
  const importJob = await getImportJobById(importJobId);

  if (String(importJob.company_id ?? "") !== company.id) {
    throw new Error("Import job does not belong to this company");
  }

  const allocationRun = await createAllocationRun({
    companyId: company.id,
    importJobId,
  });

  try {
    const [rows, rules] = await Promise.all([
      listImportRowsForAllocation(importJobId),
      listActiveAllocationRules(company.id),
    ]);

    if (!rules.length) {
      throw new Error("No active allocation rules found");
    }

    const result = await runAllocationV2({
      companyId: company.id,
      importJobId,
      allocationRunId: allocationRun.id,
      rows,
      rules,
    });

    await replaceAllocationRunLines(allocationRun.id, result.lines);

    await finishAllocationRun({
      allocationRunId: allocationRun.id,
      inputRowCount: result.inputRowCount,
      allocatedRowCount: result.allocatedRowCount,
      skippedRowCount: result.skippedRowCount,
      warningCount: result.warningCount,
    });

    revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
    revalidatePath(`/c/${companySlug}/statements`);
    revalidatePath(`/c/${companySlug}/allocations/runs`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown allocation v2 error";

    await failAllocationRun({
      allocationRunId: allocationRun.id,
      errorText: message,
    });

    throw error;
  }
}