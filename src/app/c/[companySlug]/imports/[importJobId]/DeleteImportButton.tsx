"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteImportAction } from "@/features/imports/imports.actions";

export default function DeleteImportButton({
  companyId,
  importId,
}: {
  companyId: string;
  importId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete() {
    if (busy) return;
    setBusy(true);
    setErr(null);

    try {
      await deleteImportAction({ companyId, importId }); // ✅ one argument
      router.push(`/c/${companyId}/imports`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete import"}
      </button>

      {err ? <div className="text-sm text-rose-600">{err}</div> : null}
    </div>
  );
}