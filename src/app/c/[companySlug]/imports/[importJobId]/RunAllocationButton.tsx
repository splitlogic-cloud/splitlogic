"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  companySlug: string;
  importJobId: string;
  disabled?: boolean;
};

export default function RunAllocationButton({
  companySlug,
  importJobId,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (disabled || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log("[RunAllocationButton] clicked", {
        companySlug,
        importJobId,
      });

      const response = await fetch("/api/imports/run-allocation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companySlug,
          importJobId,
        }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Allocation failed");
      }

      router.refresh();
    } catch (err) {
      console.error("[RunAllocationButton] failed", err);
      setError(err instanceof Error ? err.message : "Allocation failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isLoading}
        className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "Running allocation..." : "Run allocation"}
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}