"use client";

import { useTransition } from "react";
import { createSplitAction } from "./actions";

type Party = {
  id: string;
  name: string | null;
  type: string | null;
};

type Props = {
  companySlug: string;
  workId: string;
  parties: Party[];
};

export default function CreateSplitForm({
  companySlug,
  workId,
  parties,
}: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await createSplitAction(formData);
        });
      }}
      className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-4"
    >
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="workId" value={workId} />

      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">Party</label>
        <select
          name="partyId"
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Select party</option>
          {parties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name ?? "Unnamed"}{party.type ? ` (${party.type})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">Role</label>
        <input
          type="text"
          name="role"
          placeholder="artist / producer / label"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">Share %</label>
        <input
          type="number"
          name="sharePercent"
          min="0"
          max="100"
          step="0.000001"
          required
          placeholder="70"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-end">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Add split"}
        </button>
      </div>
    </form>
  );
}