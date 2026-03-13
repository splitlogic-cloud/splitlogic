"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  createImportJobAndSignedUploadAction,
  markUploadCompleteAction,
  parseImportCsvAction,
} from "@/features/imports/imports.actions";

type Props = {
  companySlug: string;
  companyId: string;
};

type Stage =
  | "idle"
  | "creating"
  | "uploading"
  | "marking"
  | "parsing"
  | "done"
  | "error";

function bytes(n: number) {
  if (!Number.isFinite(n)) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function UploadImportsClient({ companySlug, companyId }: Props) {
  const router = useRouter();

  const [file, setFile] = React.useState<File | null>(null);
  const [stage, setStage] = React.useState<Stage>("idle");
  const [progress, setProgress] = React.useState<number>(0);
  const [error, setError] = React.useState<string | null>(null);

  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const isBusy =
    stage === "creating" ||
    stage === "uploading" ||
    stage === "marking" ||
    stage === "parsing";

  function reset() {
    setStage("idle");
    setProgress(0);
    setError(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onPickFile(f: File | null) {
    setError(null);
    setProgress(0);
    setStage("idle");
    setFile(f);
  }

  async function uploadWithProgress(url: string, f: File) {
    // fetch() stödjer inte progress events på ett bra sätt i alla miljöer.
    // Vi använder XHR för stabil progress i browser.
    return await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url, true);

      xhr.setRequestHeader(
        "content-type",
        f.type || "application/octet-stream"
      );

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          setProgress(pct);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      };

      xhr.onerror = () => reject(new Error("Upload failed: network error"));
      xhr.onabort = () => reject(new Error("Upload aborted"));

      xhr.send(f);
    });
  }

  async function onStartUpload() {
    if (!file) return;

    setError(null);
    setStage("creating");
    setProgress(0);

    try {
      // 1) Create import + signed upload url
      const { importId, uploadUrl, storagePath } =
        await createImportJobAndSignedUploadAction({
          companyId,
          filename: file.name,
          contentType: file.type,
        });

      // 2) Upload file to signed URL
      setStage("uploading");
      await uploadWithProgress(uploadUrl, file);

      // 3) Mark complete
      setStage("marking");
      await markUploadCompleteAction({ importId, storagePath });

      // 4) Parse
      setStage("parsing");
      await parseImportCsvAction({ importId });

      setStage("done");
      setProgress(100);

      // 5) Go to detail page
      router.push(`/c/${companySlug}/works/imports/${importId}`);
      router.refresh();
    } catch (e: any) {
      console.error(e);
      setStage("error");
      setError(e?.message ?? "Unknown error");
    }
  }

  // Drag & drop handlers
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isBusy) return;

    const f = e.dataTransfer.files?.[0] ?? null;
    if (!f) return;

    onPickFile(f);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  const stageLabel: Record<Stage, string> = {
    idle: "Välj en fil för import.",
    creating: "Skapar importjobb…",
    uploading: "Laddar upp fil…",
    marking: "Verifierar upload…",
    parsing: "Tolkar CSV…",
    done: "Klart!",
    error: "Fel uppstod.",
  };

  return (
    <div className="space-y-4">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className={[
          "rounded-2xl border border-slate-200 bg-white p-6",
          "shadow-sm",
          isBusy ? "opacity-70 pointer-events-none" : "hover:border-slate-300",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Upload import</h2>
            <p className="text-sm text-slate-600">{stageLabel[stage]}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isBusy}
              className="text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-60"
            >
              Välj fil
            </button>

            <button
              type="button"
              onClick={onStartUpload}
              disabled={isBusy || !file}
              className="text-sm px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Starta
            </button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />

        <div className="mt-4 grid gap-3">
          <div className="rounded-xl border border-dashed border-slate-200 p-4 bg-slate-50">
            <div className="text-sm text-slate-700">
              Dra & släpp en CSV här, eller klicka “Välj fil”.
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Tips: stora filer funkar, men första uploaden kan ta lite tid.
            </div>
          </div>

          {file ? (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{file.name}</div>
                  <div className="text-xs text-slate-500">
                    {bytes(file.size)} • {file.type || "unknown type"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={reset}
                  disabled={isBusy}
                  className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-60"
                >
                  Rensa
                </button>
              </div>

              <div className="mt-3">
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-2 bg-slate-900 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {stage === "uploading" || stage === "done"
                    ? `${progress}%`
                    : stage === "idle"
                    ? "0%"
                    : "—"}
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-sm font-medium text-rose-800">
                Upload failed
              </div>
              <div className="mt-1 text-sm text-rose-700 whitespace-pre-wrap">
                {error}
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={reset}
                  className="text-sm px-3 py-2 rounded-lg bg-rose-700 text-white hover:bg-rose-600"
                >
                  Reset
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="text-xs text-slate-500">
        Route efter import:{" "}
        <span className="font-mono">
          /c/{companySlug}/works/imports/&lt;importId&gt;
        </span>
      </div>
    </div>
  );
}