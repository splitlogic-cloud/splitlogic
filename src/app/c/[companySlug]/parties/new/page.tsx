// src/app/c/[companySlug]/parties/new/page.tsx
import "server-only";
import { createPartyAction } from "../actions";

export default async function NewPartyPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New party</h1>
        <p className="text-sm text-slate-500">
          Create a new rights holder or recipient
        </p>
      </div>

      <form
        action={createPartyAction.bind(null, companySlug)}
        className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Artist / Label / Writer"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="type" className="text-sm font-medium">
            Type
          </label>
          <select
            id="type"
            name="type"
            defaultValue="artist"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="artist">Artist</option>
            <option value="producer">Producer</option>
            <option value="writer">Writer</option>
            <option value="label">Label</option>
            <option value="publisher">Publisher</option>
            <option value="manager">Manager</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create party
          </button>

          <a
            href={`/c/${companySlug}/parties`}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}