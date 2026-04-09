import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPartyAction, deletePartyAction } from "./actions";

export const dynamic = "force-dynamic";

function isSchemaCompatibilityError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("could not find the") ||
    lower.includes("schema cache")
  );
}

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

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sv-SE");
}

async function listPartiesForCompany(companyId: string): Promise<PartyRow[]> {
  const attempts: Array<{
    select: string;
    orderBy?: string;
    mapRow: (row: Record<string, unknown>) => PartyRow;
  }> = [
    {
      select: "id, name, email, type, external_id, created_at, updated_at",
      orderBy: "created_at",
      mapRow: (row) => ({
        id: String(row.id),
        name: asNullableString(row.name),
        email: asNullableString(row.email),
        type: asNullableString(row.type),
        external_id: asNullableString(row.external_id),
        created_at: asNullableString(row.created_at),
        updated_at: asNullableString(row.updated_at),
      }),
    },
    {
      select: "id, name, email, type, created_at",
      orderBy: "created_at",
      mapRow: (row) => ({
        id: String(row.id),
        name: asNullableString(row.name),
        email: asNullableString(row.email),
        type: asNullableString(row.type),
        external_id: null,
        created_at: asNullableString(row.created_at),
        updated_at: null,
      }),
    },
    {
      select: "id, name, created_at",
      orderBy: "created_at",
      mapRow: (row) => ({
        id: String(row.id),
        name: asNullableString(row.name),
        email: null,
        type: null,
        external_id: null,
        created_at: asNullableString(row.created_at),
        updated_at: null,
      }),
    },
    {
      select: "id, name",
      mapRow: (row) => ({
        id: String(row.id),
        name: asNullableString(row.name),
        email: null,
        type: null,
        external_id: null,
        created_at: null,
        updated_at: null,
      }),
    },
  ];

  const errors: string[] = [];

  for (const attempt of attempts) {
    let query = supabaseAdmin
      .from("parties")
      .select(attempt.select)
      .eq("company_id", companyId)
      .limit(500);

    if (attempt.orderBy) {
      query = query.order(attempt.orderBy, { ascending: false });
    }

    const { data, error } = await query;

    if (!error) {
      const rows = ((data ?? []) as unknown[]).map((row) =>
        attempt.mapRow((row ?? {}) as Record<string, unknown>)
      );
      return rows;
    }

    errors.push(error.message);
  }

  // Legacy schema fallback: some environments only expose minimal fields.
  const { data: legacyRows, error: legacyError } = await supabaseAdmin
    .from("parties")
    .select("*")
    .eq("company_id", companyId)
    .limit(500);

  if (!legacyError) {
    return ((legacyRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      name: asNullableString(row.name),
      email: asNullableString(row.email),
      type: asNullableString(row.type),
      external_id: asNullableString(row.external_id),
      created_at: asNullableString(row.created_at),
      updated_at: asNullableString(row.updated_at),
    }));
  }

  if (isSchemaCompatibilityError(legacyError.message)) {
    return [];
  }

  throw new Error(`load parties failed: ${errors.join(" | ")}`);
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

  const rows = await listPartiesForCompany(company.id);

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
              <th className="px-4 py-3 font-semibold text-zinc-700">Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
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
                  <td className="px-4 py-4 text-zinc-700">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/c/${companySlug}/parties/${party.id}/edit`}
                        className="text-sm text-blue-700 underline"
                      >
                        Edit
                      </Link>
                      <form>
                        <input type="hidden" name="partyId" value={party.id} />
                        <button
                          type="submit"
                          className="text-sm text-red-700 underline"
                          formAction={deletePartyAction.bind(null, companySlug)}
                          onClick={(event) => {
                            if (!confirm("Delete this party? This cannot be undone.")) {
                              event.preventDefault();
                            }
                          }}
                        >
                          Delete
                        </button>
                      </form>
                    </div>
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