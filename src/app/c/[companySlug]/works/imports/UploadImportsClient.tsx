"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createImportJobAndSignedUploadAction,
  markUploadCompleteAction,
  parseImportCsvAction,
} from "@/features/imports/imports.actions";

export default function UploadImportsClient({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          setBusy(true);
          setErr(null);

          try {
            const { importId, uploadUrl } = await createImportJobAndSignedUploadAction(companyId, {
              name: file.name,
              type: file.type || "text/csv",
              size: file.size,
              provider: "unknown",
            });

            // Upload to signed URL
            const upRes = await fetch(uploadUrl, {
              method: "PUT",
              body: file,
              headers: {
                "content-type": file.type || "text/csv",
              },
            });

            if (!upRes.ok) {
              const t = await upRes.text().catch(() => "");
              throw new Error(`Upload failed (${upRes.status}): ${t || upRes.statusText}`);
            }

            await markUploadCompleteAction(companyId, importId);
            await parseImportCsvAction(companyId, importId);

            router.push(`/c/${companyId}/imports/${importId}`);
            router.refresh();
          } catch (e: any) {
            setErr(String(e?.message ?? e));
          } finally {
            setBusy(false);
            e.currentTarget.value = "";
          }
        }}
      />

      {busy && <div>Uploading + parsing…</div>}
      {err && <div style={{ color: "crimson" }}>{err}</div>}
    </div>
  );
}