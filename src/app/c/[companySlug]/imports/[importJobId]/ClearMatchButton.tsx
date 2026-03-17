"use client";

import { useTransition } from "react";
import { clearImportRowMatchAction } from "./actions";

type Props = {
  companySlug: string;
  importJobId: string;
  rowId: string;
};

export default function ClearMatchButton({
  companySlug,
  importJobId,
  rowId,
}: Props) {
  const [isPending, startTransition] = useTransition();

  function onClear() {
    const formData = new FormData();
    formData.set("companySlug", companySlug);
    formData.set("importJobId", importJobId);
    formData.set("rowId", rowId);

    startTransition(async () => {
      await clearImportRowMatchAction(formData);
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={onClear}
      className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
    >
      {isPending ? "Clearing…" : "Clear match"}
    </button>
  );
}