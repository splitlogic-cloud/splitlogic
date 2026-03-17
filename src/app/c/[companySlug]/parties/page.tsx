import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPartyAction } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

type CompanyRecord = {
  id: string;
  slug: string | null;
  name: string | null;
};

type PartyRow = {
  id: string;
  name: string | null;
  email: string | null;
  type: string | null;
  external_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sv-SE");
}

export default async function PartiesPage({ params }: PageProps) {
  const { companySlug } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle<CompanyRecord>();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const { data: parties, error: partiesError } = await supabaseAdmin
    .from("parties")
    .select("id, name, email, type, external_id, created_at, updated_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (partiesError) {
    throw new Error(`load parties failed: ${partiesError.message}`);
  }

  const rows = (parties ?? []) as PartyRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="text-sm text-zinc-500">
            <Link
              href={`/c/${companySlug}`}
              className="hover:text-zinc-900 hover:underline"
            >
              Dashboard
            </Link>{" "}
            / <span className="text-zinc-900">Parties</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            Parties
          </h1>

          <div className="text-sm text-zinc-600">
            <span className="font-medium">{company.name ?? company.slug}</span>
            {" · "}
            {rows.length} parties shown
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
          <div className="font-medium text-zinc-900">Party registry</div>
          <div className="mt-1 text-zinc-600">
            Artists, producers, labels and other payees used in splits and
            statements.
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Add party</h2>
          <p className="text-sm text-zinc-600">
            Create parties used in work splits, allocations and statements.
          </p>
        </div>

        <form
          action={createPartyAction.bind(null, companySlug)}
          className="grid gap-4 md:grid-cols-4"
        >
          <div className="md:col-span-2">
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Erik Lundin"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500"
            />
          </div>

          <div>
            <label
              htmlFor="type"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Type
            </label>
            <select
              id="type"
              name="type"
              defaultValue="artist"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            >
              <option value="artist">artist</option>
              <option value="producer">producer</option>
              <option value="label">label</option>
              <option value="writer">writer</option>
              <option value="publisher">publisher</option>
              <option value="other">other</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500"
            />
          </div>

          <div className="md:col-span-4">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Add party
            </button>
          </div>
        </form>
      </section>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr className="border-b border-zinc-200">
              <th className="px-4 py-3 font-semibold text-zinc-700">Name</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Type</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Email</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">
                External ID
              </th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Created</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
                  No parties found for this company.
                </td>
              </tr>
            ) : (
              rows.map((party) => (
                <tr key={party.id} className="border-b border-zinc-100">
                  <td className="px-4 py-4 font-medium text-zinc-900">
                    {party.name || "—"}
                  </td>
                  <td className="px-4 py-4 text-zinc-700">
                    {party.type || "—"}
                  </td>
                  <td className="px-4 py-4 text-zinc-700">
                    {party.email || "—"}
                  </td>
                  <td className="px-4 py-4 text-zinc-700">
                    {party.external_id || "—"}
                  </td>
                  <td className="px-4 py-4 text-zinc-700">
                    {formatDate(party.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}