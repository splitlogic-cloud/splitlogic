"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bootstrapWorksFromImport } from "@/features/works/actions/bootstrapWorksFromImport";

type Props = {
  companyId: string;
  companySlug: string;
  importJobId: string;
};

export default function BootstrapWorksButton({
  companyId,
  companySlug,
  importJobId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          setError(null);

          startTransition(async () => {
            try {
              const result = await bootstrapWorksFromImport({
                companyId,
                companySlug,
                importJobId,
              });

              setMessage(`Inserted ${result.inserted}. Skipped ${result.skipped}.`);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Bootstrap failed");
            }
          });
        }}
        className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
      >
        {isPending ? "Bootstrapping..." : "Bootstrap works"}
      </button>

      {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}