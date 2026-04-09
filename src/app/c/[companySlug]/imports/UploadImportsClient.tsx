"use client";

import { useRef, useState } from "react";

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
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onPickFile(selected: File | null) {
    setFile(selected);
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (isUploading) return;
    const selected = e.dataTransfer.files?.[0] ?? null;
    onPickFile(selected);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

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
      setIsDragging(false);

      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel vid upload.");
    } finally {
      setIsUploading(false);
    }
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

      <div className="space-y-2">
        <label
          htmlFor="csv-file-input"
          className="block text-sm font-medium text-slate-700"
        >
          CSV-fil
        </label>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={[
            "rounded-xl border border-dashed p-4 transition",
            isDragging
              ? "border-cyan-400 bg-cyan-50"
              : "border-slate-300 bg-slate-50",
            isUploading ? "pointer-events-none opacity-70" : "cursor-pointer",
          ].join(" ")}
          onClick={() => inputRef.current?.click()}
        >
          <div className="text-sm text-slate-700">
            Dra & släpp en CSV här, eller klicka för att välja fil.
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {file ? `Vald fil: ${file.name}` : "Ingen fil vald ännu."}
          </div>
        </div>
        <input
          ref={inputRef}
          id="csv-file-input"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
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