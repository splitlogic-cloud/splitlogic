"use client";

import { useFormStatus } from "react-dom";
import { runAllocationV2Action } from "./runAllocationV2Action";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Running Allocation V2..." : "Run Allocation V2"}
    </button>
  );
}

export default function RunAllocationV2Button({
  companySlug,
  importJobId,
}: {
  companySlug: string;
  importJobId: string;
}) {
  return (
    <form action={runAllocationV2Action} className="inline-block">
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="importJobId" value={importJobId} />
      <SubmitButton />
    </form>
  );
}