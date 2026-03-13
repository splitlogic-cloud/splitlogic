"use client";

import { useTransition } from "react";
import { runWorkMatchingAction } from "./actions";

export default function RunWorkMatchingButton({
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
          await runWorkMatchingAction({ companySlug, importJobId });
        })
      }
      disabled={isPending}
      className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
    >
      {isPending ? "Matching works..." : "Run work matching"}
    </button>
  );
}