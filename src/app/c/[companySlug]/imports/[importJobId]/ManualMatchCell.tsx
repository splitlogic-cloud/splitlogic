"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

type SearchResponse = WorkSearchResult[] | { results?: WorkSearchResult[]; error?: string };

function formatWorkLabel(work: WorkSearchResult) {
  return work.artist?.trim() ? `${work.title} — ${work.artist}` : work.title;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
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

  const [query, setQuery] = useState(normalizeText(initialTitle));
  const [artist, setArtist] = useState(normalizeText(initialArtist));

  const [results, setResults] = useState<WorkSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isSearching, setIsSearching] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSearchControllerRef = useRef<AbortController | null>(null);
  const latestSearchRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const trimmedQuery = useMemo(() => normalizeText(query), [query]);
  const trimmedArtist = useMemo(() => normalizeText(artist), [artist]);

  const canSearch = trimmedQuery.length >= 2;
  const canCreate = trimmedQuery.length > 0;
  const isBusy = isSearching || isMatching || isCreating;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (activeSearchControllerRef.current) {
        activeSearchControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    setSearchError(null);
    setActionError(null);
    setNotice(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (activeSearchControllerRef.current) {
      activeSearchControllerRef.current.abort();
      activeSearchControllerRef.current = null;
    }

    if (!canSearch) {
      setIsSearching(false);
      setHasSearched(false);
      setResults([]);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      void performSearch(trimmedQuery);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [trimmedQuery, canSearch]);

  async function performSearch(nextQuery: string) {
    const requestId = latestSearchRequestIdRef.current + 1;
    latestSearchRequestIdRef.current = requestId;

    const controller = new AbortController();
    activeSearchControllerRef.current = controller;

    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(
        `/api/works/search?companyId=${encodeURIComponent(companyId)}&q=${encodeURIComponent(nextQuery)}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        }
      );

      const payload = (await res.json().catch(() => null)) as SearchResponse | null;

      if (!res.ok) {
        const message =
          payload && !Array.isArray(payload) && typeof payload.error === "string"
            ? payload.error
            : "Work search failed";
        throw new Error(message);
      }

      const parsedResults = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.results)
          ? payload.results
          : [];

      if (!isMountedRef.current) return;
      if (requestId !== latestSearchRequestIdRef.current) return;

      setResults(parsedResults);
      setHasSearched(true);
    } catch (err) {
      if (!isMountedRef.current) return;

      const aborted =
        err instanceof DOMException && err.name === "AbortError";

      if (aborted) {
        return;
      }

      if (requestId !== latestSearchRequestIdRef.current) return;

      setResults([]);
      setHasSearched(true);
      setSearchError(err instanceof Error ? err.message : "Work search failed");
    } finally {
      if (!isMountedRef.current) return;
      if (requestId !== latestSearchRequestIdRef.current) return;
      setIsSearching(false);
    }
  }

  async function refreshImportPage() {
    router.refresh();
  }

  async function matchExistingWork(workId: string) {
    if (!workId || isBusy) return;

    setActionError(null);
    setNotice(null);
    setIsMatching(true);

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

      if (!isMountedRef.current) return;

      setNotice("Matched successfully.");
      setResults([]);
      setHasSearched(false);

      await refreshImportPage();
    } catch (err) {
      if (!isMountedRef.current) return;
      setActionError(err instanceof Error ? err.message : "Manual match failed");
    } finally {
      if (!isMountedRef.current) return;
      setIsMatching(false);
    }
  }

  async function createWorkAndMatch() {
    if (!canCreate || isBusy) return;

    setActionError(null);
    setNotice(null);
    setIsCreating(true);

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
          title: trimmedQuery,
          artist: trimmedArtist || null,
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Create work and match failed");
      }

      if (!isMountedRef.current) return;

      setNotice("Created and matched successfully.");
      setResults([]);
      setHasSearched(false);

      await refreshImportPage();
    } catch (err) {
      if (!isMountedRef.current) return;
      setActionError(
        err instanceof Error ? err.message : "Create work and match failed"
      );
    } finally {
      if (!isMountedRef.current) return;
      setIsCreating(false);
    }
  }

  return (
    <div className="min-w-[340px] space-y-2">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search work title..."
          disabled={isMatching || isCreating}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none ring-0 placeholder:text-neutral-400 focus:border-neutral-500"
        />

        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist (optional)"
          disabled={isMatching || isCreating}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none ring-0 placeholder:text-neutral-400 focus:border-neutral-500"
        />
      </div>

      <div className="min-h-[18px]">
        {isSearching ? (
          <p className="text-xs text-neutral-500">Searching...</p>
        ) : searchError ? (
          <p className="text-xs text-red-600">{searchError}</p>
        ) : canSearch && hasSearched && results.length === 0 ? (
          <p className="text-xs text-neutral-500">No matching works found.</p>
        ) : trimmedQuery.length > 0 && trimmedQuery.length < 2 ? (
          <p className="text-xs text-neutral-500">
            Type at least 2 characters to search.
          </p>
        ) : null}
      </div>

      {results.length > 0 ? (
        <div className="max-h-44 space-y-1 overflow-auto rounded-md border border-neutral-200 bg-white p-2">
          {results.map((work) => (
            <button
              key={work.id}
              type="button"
              onClick={() => void matchExistingWork(work.id)}
              disabled={isBusy}
              className="block w-full rounded-md border border-neutral-200 px-2 py-1.5 text-left text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {formatWorkLabel(work)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void createWorkAndMatch()}
          disabled={!canCreate || isBusy}
          className="rounded-md border border-black px-2.5 py-1.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCreating ? "Creating..." : isMatching ? "Matching..." : "Create new work + match"}
        </button>
      </div>

      <div className="min-h-[18px]">
        {notice ? (
          <p className="text-xs text-emerald-700">{notice}</p>
        ) : actionError ? (
          <p className="text-xs text-red-600">{actionError}</p>
        ) : null}
      </div>
    </div>
  );
}