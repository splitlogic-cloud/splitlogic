"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  companySlug: string;
};

export default function UploadMasterdataClient({ companySlug }: Props) {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const canUpload = useMemo(() => !!file && !isUploading, [file, isUploading]);

  async function onUpload() {
    setError(null);
    setResult(null);

    if (!file) return;

    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);

      // Om din endpoint kräver annan field (t.ex. "upload"), ändra här.
      const res = await fetch(`/c/${companySlug}/masterdata/upload`, {
        method: "POST",
        body: fd,
      });

      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(typeof payload === "string" ? payload : (payload?.error || "Upload failed"));
      }

      setResult(payload);

      // Refresh så server component refetchar jobs/rows
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <input
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />

        <button
          onClick={onUpload}
          disabled={!canUpload}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm hover:opacity-90 disabled:opacity-50"
          title="POST till /masterdata/upload"
        >
          {isUploading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <div className="font-semibold">Upload error</div>
          <div className="mt-1 whitespace-pre-wrap">{error}</div>
        </div>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-semibold">Upload result</div>
          <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap break-words">
            {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      ) : null}

      <p className="text-xs text-slate-600">
        Tips: 405 i browser = du GET:ade endpointen. Upload ska alltid triggas via knappen (POST).
      </p>
    </div>
  );
}