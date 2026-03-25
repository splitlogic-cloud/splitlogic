"use client";

import { runAllocationAction } from "./actions";

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
  async function debugClick() {
    console.log("[RunAllocationButton] clicked", {
      companySlug,
      importJobId,
      disabled,
    });
  }

  return (
    <div className="relative z-[9999] pointer-events-auto">
      <form
        action={runAllocationAction}
        className="inline-block relative z-[9999] pointer-events-auto"
      >
        <input type="hidden" name="companySlug" value={companySlug} />
        <input type="hidden" name="importJobId" value={importJobId} />

        <button
          type="submit"
          onClick={debugClick}
          disabled={disabled}
          className="relative z-[9999] pointer-events-auto inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Run allocation
        </button>
      </form>
    </div>
  );
}