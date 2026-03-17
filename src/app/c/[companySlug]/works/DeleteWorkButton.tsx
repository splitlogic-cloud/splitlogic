"use client";

import { useTransition } from "react";
import { deleteWorkAction } from "./actions";

type Props = {
  companySlug: string;
  workId: string;
};

export default function DeleteWorkButton({
  companySlug,
  workId,
}: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        const ok = window.confirm(
          "Are you sure you want to delete this work? This will also remove its splits."
        );

        if (!ok) return;

        startTransition(async () => {
          await deleteWorkAction(formData);
        });
      }}
    >
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="workId" value={workId} />

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
    </form>
  );
}