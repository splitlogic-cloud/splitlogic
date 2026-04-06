"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  companySlug: string;
  importJobId: string;
  disabled?: boolean;
  label?: string;
};

type RunAllocationResponse = {
  ok?: boolean;
  success?: boolean;
  error?: string;
};

export default function RunAllocationButton({
  companySlug,
  importJobId,
  disabled = false,
  label,
}: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (disabled || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
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

      let data: RunAllocationResponse | null = null;

      try {
        data = (await response.json()) as RunAllocationResponse;
      } catch {
        throw new Error("Allocation API returned invalid response");
      }

      if (!response.ok) {
        throw new Error(data?.error || `Allocation failed (${response.status})`);
      }

      const succeeded = data?.ok === true || data?.success === true;
      if (!succeeded) {
        throw new Error(data?.error || "Allocation failed");
      }

      router.refresh();
    } catch (err) {
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
        {isLoading ? "Running allocation..." : label ?? "Run allocation"}
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}