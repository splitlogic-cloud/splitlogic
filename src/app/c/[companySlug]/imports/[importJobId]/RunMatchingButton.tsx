import "server-only";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { matchImportRowsForImport } from "@/features/imports/imports.matching";

async function runMatchingAction(formData: FormData) {
  "use server";

  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId");
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  const { data: importJob, error: importJobError } = await supabaseAdmin
    .from("import_jobs")
    .select("id, company_id")
    .eq("id", importJobId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (importJobError || !importJob) {
    throw new Error("Import job not found");
  }

  const { error: setStatusError } = await supabaseAdmin
    .from("import_jobs")
    .update({
      status: "matching",
      updated_at: new Date().toISOString(),
    })
    .eq("id", importJobId);

  if (setStatusError) {
    throw new Error(`Failed to set import job to matching: ${setStatusError.message}`);
  }

  try {
    await matchImportRowsForImport({
      companyId: company.id,
      importJobId,
    });
  } catch (error) {
    await supabaseAdmin
      .from("import_jobs")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", importJobId);

    throw error;
  }

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
}

type Props = {
  companySlug: string;
  importJobId: string;
  disabled?: boolean;
};

export default function RunMatchingButton({
  companySlug,
  importJobId,
  disabled = false,
}: Props) {
  return (
    <form action={runMatchingAction}>
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="importJobId" value={importJobId} />
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center rounded-md border border-black px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        Run matching
      </button>
    </form>
  );
}