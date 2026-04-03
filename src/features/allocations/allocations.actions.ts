"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditEvent } from "@/features/audit/audit.repo";
import { runAllocationForImportJob } from "./allocations.service";

type CompanyLookupRow = {
  id: string;
  slug: string;
};

export async function runAllocationAction(formData: FormData) {
  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId.");
  }

  // ✅ Hämta companyId från companySlug
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error(`Company not found: ${companyError?.message ?? ""}`);
  }

  const typedCompany = company as CompanyLookupRow;

  // ✅ Kör allocation via service
  const result = await runAllocationForImportJob({
    companyId: typedCompany.id,
    importJobId,
    createdBy: null,
  });

  // ✅ Skapa audit-event
  await createAuditEvent({
    companyId: typedCompany.id,
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

  // ✅ Revalidate paths
  revalidatePath(`/c/${companySlug}/imports`);
  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
  revalidatePath(`/c/${companySlug}/allocations`);

  return result;
}