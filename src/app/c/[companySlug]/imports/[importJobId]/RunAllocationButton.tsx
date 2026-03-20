"use client";

import { useFormStatus } from "react-dom";
import { runAllocationAction } from "@/features/allocations/allocations.actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Running allocation..." : "Run allocation"}
    </button>
  );
}

export default function RunAllocationButton(props: {
  companySlug: string;
  importJobId: string;
}) {
  return (
    <form action={runAllocationAction}>
      <input type="hidden" name="companySlug" value={props.companySlug} />
      <input type="hidden" name="importJobId" value={props.importJobId} />
      <SubmitButton />
    </form>
  );
}