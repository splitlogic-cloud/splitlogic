import "server-only";

import { revalidatePath } from "next/cache";
import { runAllocation } from "@/features/allocations/run-allocation";

async function runAllocationAction(formData: FormData) {
  "use server";

  const companySlug = String(formData.get("companySlug") ?? "");
  const importJobId = String(formData.get("importJobId") ?? "");

  if (!companySlug || !importJobId) {
    throw new Error("Missing companySlug or importJobId");
  }

  await runAllocation(importJobId);

  revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
  revalidatePath(`/c/${companySlug}/allocations`);
}

type Props = {
  companySlug: string;
  importJobId: string;
  disabled?: boolean;
};

export default function RunAllocationButton({
  companySlug,
  importJobId,
  disabled = false,
}: Props) {
  return (
    <form action={runAllocationAction}>
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="importJobId" value={importJobId} />
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Run allocation
      </button>
    </form>
  );
}