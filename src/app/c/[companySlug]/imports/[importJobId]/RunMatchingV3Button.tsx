"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { runMatchingV3Action } from "./runMatchingV3Action";

type Props = {
  companySlug: string;
  importJobId: string;
};

export default function RunMatchingV3Button({
  companySlug,
  importJobId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onRun() {
    const formData = new FormData();
    formData.set("companySlug", companySlug);
    formData.set("importJobId", importJobId);

    startTransition(async () => {
      await runMatchingV3Action(formData);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onRun}
      disabled={isPending}
      className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Running matching..." : "Run work matching"}
    </button>
  );
}