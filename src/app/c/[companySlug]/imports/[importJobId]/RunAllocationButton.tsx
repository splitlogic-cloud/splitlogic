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
  return (
    <>
      <button
        type="button"
        onClick={() => {
          alert(
            JSON.stringify({
              source: "debug-button",
              companySlug,
              importJobId,
              disabled,
            })
          );
          console.log("[RunAllocationButton] debug button clicked", {
            companySlug,
            importJobId,
            disabled,
          });
        }}
        className="fixed bottom-6 right-6 z-[999999] rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg"
      >
        DEBUG CLICK
      </button>

      <form
        action={runAllocationAction}
        className="inline-block relative z-[9999] pointer-events-auto"
      >
        <input type="hidden" name="companySlug" value={companySlug} />
        <input type="hidden" name="importJobId" value={importJobId} />

        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Run allocation
        </button>
      </form>
    </>
  );
}