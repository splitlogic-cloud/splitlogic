"use client";

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
  const [isPending, startTransition] = useTransition();

  function onRun() {
    const formData = new FormData();
    formData.set("companySlug", companySlug);
    formData.set("importJobId", importJobId);

    startTransition(async () => {
      await runMatchingV3Action(formData);
    });
  }

  return (
    <button
      type="button"
      onClick={onRun}
      disabled={isPending}
      className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
    >
      {isPending ? "Running matching…" : "Run matching v3"}
    </button>
  );
}