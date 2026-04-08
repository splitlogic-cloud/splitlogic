"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateCompanyClient() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [orgnr, setOrgnr] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createCompany() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/companies/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, orgnr: orgnr.trim() || null }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        details?: unknown;
        company?: { slug?: string };
      };
      if (!res.ok || !json?.ok) {
        const detailText =
          json?.details && typeof json.details === "object"
            ? JSON.stringify(json.details)
            : typeof json?.details === "string"
              ? json.details
              : null;
        throw new Error(
          [json?.error || `Failed: ${res.status}`, detailText].filter(Boolean).join(" — ")
        );
      }

      // redirect into company
      const slug = json.company?.slug;
      if (!slug) throw new Error("Missing slug from response");

      setOpen(false);
      router.push(`/c/${slug}/statements`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Okänt fel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium bg-white"
        type="button"
      >
        + Skapa bolag
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
          <div className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Skapa nytt bolag</div>
                <div className="text-xs text-slate-500">Detta blir din arbetsyta (multi-tenant).</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-md border text-sm"
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Bolagsnamn</label>
                <input
                  className="h-10 w-full rounded-md border px-3 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="t.ex. World Affairs AB"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-500">Org.nr (valfritt)</label>
                <input
                  className="h-10 w-full rounded-md border px-3 text-sm"
                  value={orgnr}
                  onChange={(e) => setOrgnr(e.target.value)}
                  placeholder="556xxx-xxxx"
                />
              </div>

              {err ? <div className="text-xs text-rose-600">{err}</div> : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setOpen(false)}
                  className="h-9 rounded-md border px-3 text-xs font-medium"
                  type="button"
                >
                  Avbryt
                </button>
                <button
                  onClick={createCompany}
                  disabled={loading}
                  className="h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white disabled:opacity-50"
                  type="button"
                >
                  {loading ? "Skapar…" : "Skapa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}