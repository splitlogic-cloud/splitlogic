import "server-only";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { matchImportRowsForImport } from "@/features/matching/match-import-rows";

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

  await matchImportRowsForImport({
    companyId: company.id,
    importId: importJobId,
  });

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