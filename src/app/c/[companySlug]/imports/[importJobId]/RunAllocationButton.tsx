"use client";

import { useTransition } from "react";
import { runAllocationAction } from "./run-allocation-action";

export default function RunAllocationButton({
  companySlug,
  importJobId,
}: {
  companySlug: string;
  importJobId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await runAllocationAction(companySlug, importJobId);
        })
      }
      disabled={isPending}
      className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {isPending ? "Running allocation..." : "Run allocation"}
    </button>
  );
}