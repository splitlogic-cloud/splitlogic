"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyMasterdataAction, undoMasterdataAction } from "./masterdata.actions";

export default function MasterdataActions({
  companySlug,
  importId,
  status,
}: {
  companySlug: string;
  importId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"apply" | "undo" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canApply = status === "parsed" || status === "undone";
  const canUndo = status === "applied";

  async function onApply() {
    setErr(null);
    setBusy("apply");
    try {
      await applyMasterdataAction(companySlug, importId);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Apply failed");
    } finally {
      setBusy(null);
    }
  }

  async function onUndo() {
    setErr(null);
    setBusy("undo");
    try {
      await undoMasterdataAction(companySlug, importId);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Undo failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <button
          onClick={onApply}
          disabled={!canApply || busy !== null}
          className="px-3 py-1 rounded border disabled:opacity-50"
        >
          {busy === "apply" ? "Applying..." : "Apply"}
        </button>

        <button
          onClick={onUndo}
          disabled={!canUndo || busy !== null}
          className="px-3 py-1 rounded border disabled:opacity-50"
        >
          {busy === "undo" ? "Undoing..." : "Undo"}
        </button>

        <span className="text-sm opacity-70">status: {status}</span>
      </div>

      {err ? <div className="text-sm text-red-600">{err}</div> : null}
    </div>
  );
}