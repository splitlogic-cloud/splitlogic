"use client";

import { useTransition } from "react";
import { deleteSplitAction } from "./actions";

type Props = {
  companySlug: string;
  workId: string;
  splitId: string;
};

export default function DeleteSplitButton({
  companySlug,
  workId,
  splitId,
}: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        const formData = new FormData();
        formData.set("companySlug", companySlug);
        formData.set("workId", workId);
        formData.set("splitId", splitId);

        startTransition(async () => {
          await deleteSplitAction(formData);
        });
      }}
      className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
    >
      {isPending ? "Removing…" : "Remove"}
    </button>
  );
}