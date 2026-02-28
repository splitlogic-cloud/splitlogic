"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteLatestImportAction } from "@/features/imports/imports.actions";

export default function DeleteImportButton({ companyId, importId }: { companyId: string; importId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <button
        disabled={busy}
        onClick={async () => {
          setErr(null);
          const ok = confirm(
            "Delete this import?\n\nRule: only the latest import can be deleted.\nThis will remove DB rows + storage file."
          );
          if (!ok) return;

          setBusy(true);
          try {
            await deleteLatestImportAction(companyId, importId);
            router.push(`/c/${companyId}/imports`);
            router.refresh();
          } catch (e: any) {
            setErr(String(e?.message ?? e));
          } finally {
            setBusy(false);
          }
        }}
        style={{
          background: "crimson",
          color: "white",
          padding: "8px 12px",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
        }}
      >
        {busy ? "Deleting…" : "Delete import"}
      </button>

      {err && <div style={{ color: "crimson", maxWidth: 420 }}>{err}</div>}
    </div>
  );
}