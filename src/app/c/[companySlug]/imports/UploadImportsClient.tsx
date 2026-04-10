"use client";

import { useState } from "react";

type Props = {
  companySlug: string;
};

type ImportSource = "revenue" | "masterdata";

export default function UploadImportsClient({ companySlug }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<ImportSource>("revenue");
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!file) {
      setError("Välj en CSV-fil först.");
      return;
    }

    try {
      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("companySlug", companySlug);
      formData.append("source", source);

      const res = await fetch("/api/imports/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Upload failed");
      }

      setMessage(`Upload klar. Import job ID: ${data.importJobId}`);
      setFile(null);

      const input = document.getElementById("csv-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel vid upload.");
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (isUploading) return;
    const dropped = e.dataTransfer.files?.[0] ?? null;
    if (!dropped) return;
    setFile(dropped);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDragActive(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="import-source"
          className="block text-sm font-medium text-slate-700"
        >
          Importtyp
        </label>

        <select
          id="import-source"
          value={source}
          onChange={(e) => setSource(e.target.value as ImportSource)}
          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="revenue">Revenue</option>
          <option value="masterdata">Masterdata</option>
        </select>
      </div>

      <div
        className={[
          "space-y-2 rounded-2xl border border-dashed p-4 transition",
          isDragActive
            ? "border-cyan-400 bg-cyan-50/40"
            : "border-slate-300 bg-slate-50/40",
        ].join(" ")}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <label
          htmlFor="csv-file-input"
          className="block text-sm font-medium text-slate-700"
        >
          CSV-fil
        </label>

        <input
          id="csv-file-input"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            setFile(selected);
          }}
          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <div className="text-xs text-slate-500">
          Dra och släpp CSV här, eller välj fil manuellt.
        </div>
      </div>

      <button
        type="submit"
        disabled={isUploading}
        className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isUploading ? "Laddar upp..." : "Upload CSV"}
      </button>

      {message ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </form>
  );
}