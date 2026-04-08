"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { generateStatementsAction } from "./actions";

type Props = {
  companySlug: string;
  selectedPeriodStart: string;
  selectedPeriodEnd: string;
};

type GenerateStatementsActionState = {
  ok: boolean;
  error: string | null;
};

const initialState: GenerateStatementsActionState = {
  ok: false,
  error: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Generating..." : "Generate statements"}
    </button>
  );
}

export default function GenerateStatementsForm(props: Props) {
  const [state, formAction] = useActionState(generateStatementsAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companySlug" value={props.companySlug} />

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label
            htmlFor="periodStart"
            className="mb-1 block text-sm font-medium text-neutral-700"
          >
            Period start
          </label>
          <input
            id="periodStart"
            name="periodStart"
            type="date"
            defaultValue={props.selectedPeriodStart}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="periodEnd"
            className="mb-1 block text-sm font-medium text-neutral-700"
          >
            Period end
          </label>
          <input
            id="periodEnd"
            name="periodEnd"
            type="date"
            defaultValue={props.selectedPeriodEnd}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-end">
          <SubmitButton />
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Preview source: allocation_lines (same source used during generation).
      </p>

      {state?.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}
    </form>
  );
}
