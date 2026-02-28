"use client";

import { useTransition } from "react";
import { deleteLatestImportAction } from "./actions";

export default function DeleteLatestImportButton({
  companySlug,
}: {
  companySlug: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await deleteLatestImportAction(companySlug);
        })
      }
    >
      {isPending ? "Deleting…" : "Undo latest import"}
    </button>
  );
}