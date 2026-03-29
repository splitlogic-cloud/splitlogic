"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type WorkSearchResult = {
  id: string;
  title: string;
  artist: string | null;
};

type Props = {
  companyId: string;
  companySlug: string;
  importJobId: string;
  rowId: string;
  initialTitle?: string | null;
  initialArtist?: string | null;
};

function formatWorkLabel(work: WorkSearchResult) {
  return work.artist ? `${work.title} — ${work.artist}` : work.title;
}

export default function ManualMatchCell({
  companyId,
  companySlug,
  importJobId,
  rowId,
  initialTitle = "",
  initialArtist = "",
}: Props) {
  const router = useRouter();

  const [query, setQuery] = useState(initialTitle ?? "");
  const [artist, setArtist] = useState(initialArtist ?? "");
  const [results, setResults] = useState<WorkSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCreate = useMemo(() => {
    return query.trim().length > 0;
  }, [query]);

  async function runSearch(nextQuery: string) {
    setQuery(nextQuery);
    setError(null);
    setNotice(null);

    const trimmed = nextQuery.trim();

    if (!trimmed) {
      setResults([]);
      return;
    }

    setIsSearching(true);

    try {
      const res = await fetch(
        `/api/works/search?companyId=${encodeURIComponent(companyId)}&q=${encodeURIComponent(trimmed)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;

        throw new Error(payload?.error || "Work search failed");
      }

      const payload = (await res.json()) as WorkSearchResult[];
      setResults(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Work search failed");
    } finally {
      setIsSearching(false);
    }
  }

  async function matchExistingWork(workId: string) {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/imports/manual-match", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            companySlug,
            importJobId,
            rowId,
            workId,
          }),
        });

        const payload = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || "Manual match failed");
        }

        setNotice("Matched successfully.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Manual match failed");
      }
    });
  }

  async function createWorkAndMatch() {
    if (!canCreate) return;

    setError(null);
    setNotice(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/works/create-and-match", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            companyId,
            companySlug,
            importJobId,
            rowId,
            title: query.trim(),
            artist: artist.trim() || null,
          }),
        });

        const payload = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || "Create work and match failed");
        }

        setNotice("Created and matched successfully.");
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Create work and match failed"
        );
      }
    });
  }

  const disabled = isPending || isSearching;

  return (
    <div className="min-w-[320px] space-y-2">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
        <input
          value={query}
          onChange={(e) => void runSearch(e.target.value)}
          placeholder="Search work title..."
          disabled={disabled}
          className="rounded-md border px-2 py-1 text-sm"
        />

        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist (optional)"
          disabled={disabled}
          className="rounded-md border px-2 py-1 text-sm"
        />
      </div>

      {isSearching ? (
        <p className="text-xs text-neutral-500">Searching...</p>
      ) : null}

      {results.length > 0 ? (
        <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
          {results.map((work) => (
            <button
              key={work.id}
              type="button"
              onClick={() => void matchExistingWork(work.id)}
              disabled={disabled}
              className="block w-full rounded-md border px-2 py-1 text-left text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {formatWorkLabel(work)}
            </button>
          ))}
        </div>
      ) : null}

      {results.length === 0 && query.trim() && !isSearching ? (
        <p className="text-xs text-neutral-500">No matching works found.</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void createWorkAndMatch()}
          disabled={!canCreate || disabled}
          className="rounded-md border border-black px-2 py-1 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Working..." : "Create new work + match"}
        </button>
      </div>

      {notice ? <p className="text-xs text-emerald-700">{notice}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}