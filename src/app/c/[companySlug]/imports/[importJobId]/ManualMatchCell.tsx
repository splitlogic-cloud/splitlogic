"use client";

import { useMemo, useState, useTransition } from "react";
import { manualMatchImportRowAction } from "./actions";

type WorkOption = {
  id: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
};

type Props = {
  companySlug: string;
  importJobId: string;
  rowId: string;
  rowTitle: string;
  rowArtist: string;
  rowIsrc: string;
  works: WorkOption[];
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export default function ManualMatchCell({
  companySlug,
  importJobId,
  rowId,
  rowTitle,
  rowArtist,
  rowIsrc,
  works,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(
    [rowTitle, rowArtist, rowIsrc].filter(Boolean).join(" ").trim()
  );
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) {
      return works.slice(0, 12);
    }

    const terms = q.split(/\s+/).filter(Boolean);

    const scored = works.map((work) => {
      const haystack = normalize(
        `${work.title ?? ""} ${work.artist ?? ""} ${work.isrc ?? ""}`
      );

      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) score += 1;
      }

      if (rowIsrc && work.isrc && normalize(work.isrc) === normalize(rowIsrc)) {
        score += 10;
      }

      if (
        rowTitle &&
        work.title &&
        normalize(work.title).includes(normalize(rowTitle))
      ) {
        score += 4;
      }

      if (
        rowArtist &&
        work.artist &&
        normalize(work.artist).includes(normalize(rowArtist))
      ) {
        score += 4;
      }

      return { work, score };
    });

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.work);
  }, [query, rowArtist, rowIsrc, rowTitle, works]);

  function submit(workId: string) {
    const formData = new FormData();
    formData.set("companySlug", companySlug);
    formData.set("importJobId", importJobId);
    formData.set("rowId", rowId);
    formData.set("workId", workId);

    startTransition(async () => {
      await manualMatchImportRowAction(formData);
      setOpen(false);
    });
  }

  return (
    <div className="min-w-[280px]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          Match manually
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Search work
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, artist or ISRC"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
          </div>

          <div className="max-h-64 space-y-2 overflow-auto">
            {filtered.length === 0 ? (
              <div className="text-sm text-zinc-500">No matching works found</div>
            ) : (
              filtered.map((work) => (
                <button
                  key={work.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => submit(work.id)}
                  className="block w-full rounded-md border border-zinc-200 p-3 text-left hover:bg-zinc-50 disabled:opacity-50"
                >
                  <div className="text-sm font-semibold text-zinc-900">
                    {work.title || "Untitled"}
                  </div>
                  <div className="text-sm text-zinc-600">
                    {work.artist || "Unknown artist"}
                  </div>
                  <div className="text-xs text-zinc-500">{work.isrc || "No ISRC"}</div>
                </button>
              ))
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
            >
              Cancel
            </button>
            {isPending ? (
              <span className="text-sm text-zinc-500">Saving…</span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}