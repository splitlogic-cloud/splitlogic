"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadImportClient({ companySlug }: { companySlug: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onUpload() {
    if (!file) return;
    setErr(null);
    setLoading(true);

    const fd = new FormData();
    fd.append("companySlug", companySlug);
    fd.append("file", file);

    const res = await fetch("/api/imports/upload", { method: "POST", body: fd });
    const json = await res.json();

    setLoading(false);

    if (!res.ok) return setErr(json?.error ?? "Upload failed");

    // Trigger parse async (du kan också göra det sync)
    await fetch("/api/imports/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companySlug, importId: json.importId }),
    });

    router.push(`/c/${companySlug}/imports/${json.importId}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      {err && <div className="text-sm text-rose-600">{err}</div>}

      <button
        disabled={!file || loading}
        onClick={onUpload}
        className="rounded-xl px-4 py-2 font-medium text-white bg-gradient-to-r from-cyan-500 to-violet-500 hover:opacity-95 disabled:opacity-60"
      >
        {loading ? "Laddar upp..." : "Upload"}
      </button>
    </div>
  );
}