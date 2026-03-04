"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ImportType = "revenue" | "masterdata";

export default function UploadImportsClient({ companySlug }: { companySlug: string }) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [type, setType] = useState<ImportType>("revenue");

  const label = useMemo(() => {
    return type === "revenue" ? "Revenue (royalty-filer)" : "Masterdata (works/parties)";
  }, [type]);

  async function uploadAndParse(file: File) {
    // 1) UPLOAD (FormData)
    const form = new FormData();
    form.set("companySlug", companySlug);
    form.set("source", type);
    form.set("file", file);

    const up = await fetch("/api/imports/upload", { method: "POST", body: form });
    const upJson = await up.json().catch(() => ({}));

    if (!up.ok || !upJson?.ok) {
      throw new Error(upJson?.error ?? `Upload failed (${up.status})`);
    }

    const importJobId = String(upJson.importJobId ?? "");
    if (!importJobId) throw new Error("Upload succeeded but missing importJobId");

    // 2) PARSE (JSON)
    const pr = await fetch("/api/imports/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companySlug, importJobId }),
    });

    const prJson = await pr.json().catch(() => ({}));
    if (!pr.ok || !prJson?.ok) {
      throw new Error(prJson?.error ?? `Parse failed (${pr.status})`);
    }

    return { importJobId };
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 14, opacity: 0.8 }}>Välj en CSV-fil och ladda upp.</div>

        <label style={{ fontSize: 13, opacity: 0.8 }}>Typ</label>
        <select
          value={type}
          disabled={busy}
          onChange={(e) => setType(e.target.value as ImportType)}
          style={{
            height: 40,
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.12)",
            padding: "0 12px",
            maxWidth: 420,
          }}
        >
          <option value="revenue">Revenue (royalty-filer)</option>
          <option value="masterdata">Masterdata (works/parties)</option>
        </select>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
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
                const { importJobId } = await uploadAndParse(file);
                router.push(`/c/${companySlug}/imports/${importJobId}`);
                router.refresh();
              } catch (ex: any) {
                setErr(String(ex?.message ?? ex));
              } finally {
                setBusy(false);
                e.currentTarget.value = "";
              }
            }}
          />

          <button
            type="button"
            disabled={busy}
            onClick={() => setErr("Välj en fil först (klicka på filväljaren).")}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 12,
              border: "0",
              cursor: busy ? "not-allowed" : "pointer",
              background: "linear-gradient(90deg,#22c55e,#6366f1)",
              color: "white",
              fontWeight: 600,
            }}
            title={label}
          >
            {busy ? "Uploading + parsing…" : "Upload & parse"}
          </button>
        </div>
      </div>

      {busy && <div>Uploading + parsing…</div>}

      {err && (
        <div
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid rgba(220,38,38,0.35)",
            background: "rgba(220,38,38,0.06)",
            color: "#b91c1c",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {err}
        </div>
      )}
    </div>
  );
}