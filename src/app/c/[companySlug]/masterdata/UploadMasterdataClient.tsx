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

  const canUpload = useMemo(() => !!file && !isUploading, [file, isUploading]);

  async function onUpload() {
    setError(null);

    if (!file) return;

    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`/c/${companySlug}/masterdata/upload`, {
        method: "POST",
        body: fd,
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Upload failed");
      }

      router.push(`/c/${companySlug}/masterdata`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">CSV file</label>
        <input
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onUpload}
          disabled={!canUpload}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isUploading ? "Uploading..." : "Upload file"}
        </button>
      </div>

      {file ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Selected file: <span className="font-medium">{file.name}</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <div className="font-semibold">Upload error</div>
          <div className="mt-1 whitespace-pre-wrap">{error}</div>
        </div>
      ) : null}
    </div>
  );
}