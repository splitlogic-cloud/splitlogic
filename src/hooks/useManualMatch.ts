import { useState } from "react";

export function useManualMatch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function manualMatch(params: {
    companySlug: string;
    importJobId: string;
    rowId: string;
    workId: string;
  }) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/imports/manual-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Manual match failed");
      }

      setLoading(false);
      return json;
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
      throw e;
    }
  }

  return { manualMatch, loading, error };
}