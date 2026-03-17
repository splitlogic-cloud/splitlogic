"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runWorkMatching } from "@/features/imports/actions/runWorkMatching";

type RunWorkMatchingButtonProps = {
  companyId: string;
  companySlug: string;
  importJobId: string;
};

export default function RunWorkMatchingButton({
  companyId,
  companySlug,
  importJobId,
}: RunWorkMatchingButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunMatching = () => {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const result = await runWorkMatching(importJobId, companyId);

        setMessage(
          `Processed ${result.processed} unmatched rows. Matched ${result.matched}.`
        );

        router.refresh();
      } catch (err) {
        const text =
          err instanceof Error ? err.message : "Failed to run work matching";
        setError(text);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <button
        type="button"
        onClick={handleRunMatching}
        disabled={isPending}
        className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Running..." : "Run work matching"}
      </button>

      {message ? (
        <p className="text-xs text-emerald-600">{message}</p>
      ) : null}

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}