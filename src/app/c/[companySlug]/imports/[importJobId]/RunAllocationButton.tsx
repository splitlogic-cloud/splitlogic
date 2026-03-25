"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runAllocationAction } from "./actions";

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDisabled = disabled || isPending;

  function handleClick() {
    setError(null);

    startTransition(async () => {
      try {
        console.log("[RunAllocationButton] clicked", {
          companySlug,
          importJobId,
        });

        await runAllocationAction({
          companySlug,
          importJobId,
        });

        router.refresh();
      } catch (err) {
        console.error("[RunAllocationButton] failed", err);
        setError(err instanceof Error ? err.message : "Allocation failed");
      }
    });
  }

  return (
    <div className="inline-flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Running allocation..." : "Run allocation"}
      </button>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : null}
    </div>
  );
}