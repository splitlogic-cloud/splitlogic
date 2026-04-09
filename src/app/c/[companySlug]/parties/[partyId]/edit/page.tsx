import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isMissingColumnError(message: string): boolean {
  return (
    message.includes("column") &&
    (message.includes("does not exist") || message.includes("schema cache"))
  );
}

function asNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value == null) return null;
  return String(value);
}

async function loadPartyForEdit(params: {
  companyId: string;
  partyId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<{
  id: string;
  name: string | null;
  email: string | null;
  type: string | null;
  external_id: string | null;
}> {
  const attempts: Array<{ select: string }> = [
    { select: "id,name,email,type,external_id" },
    { select: "id,name,email,type" },
    { select: "id,name,email,external_id" },
    { select: "id,name,email" },
    { select: "id,name,type,external_id" },
    { select: "id,name,type" },
    { select: "id,name,external_id" },
    { select: "id,name" },
  ];

  for (const attempt of attempts) {
    const { data, error } = await params.supabase
      .from("parties")
      .select(attempt.select)
      .eq("company_id", params.companyId)
      .eq("id", params.partyId)
      .maybeSingle();

    if (!error) {
      if (!data) {
        throw new Error(`Party not found for id: ${params.partyId}`);
      }

      const record = data as unknown as Record<string, unknown>;
      return {
        id: String(record.id),
        name: asNullableString(record.name),
        email: asNullableString(record.email),
        type: asNullableString(record.type),
        external_id: asNullableString(record.external_id),
      };
    }

    if (!isMissingColumnError(error.message)) {
      throw new Error(`load party failed: ${error.message}`);
    }
  }

  throw new Error("load party failed: no compatible parties columns found");
}

async function updatePartyRecord(params: {
  companyId: string;
  partyId: string;
  name: string;
  email: string | null;
  type: string | null;
  externalId: string | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<void> {
  const payloadAttempts: Array<Record<string, unknown>> = [
    {
      name: params.name,
      email: params.email,
      type: params.type,
      external_id: params.externalId,
      updated_at: new Date().toISOString(),
    },
    {
      name: params.name,
      email: params.email,
      type: params.type,
      external_id: params.externalId,
    },
    {
      name: params.name,
      email: params.email,
      type: params.type,
    },
    {
      name: params.name,
      email: params.email,
    },
    {
      name: params.name,
      type: params.type,
    },
    {
      name: params.name,
    },
  ];

  for (const payload of payloadAttempts) {
    const { error } = await params.supabase
      .from("parties")
      .update(payload)
      .eq("company_id", params.companyId)
      .eq("id", params.partyId);

    if (!error) {
      return;
    }

    if (!isMissingColumnError(error.message)) {
      throw new Error(`update party failed: ${error.message}`);
    }
  }

  throw new Error("update party failed: no compatible parties columns found");
}

export default async function EditPartyPage({
  params,
}: {
  params: Promise<{ companySlug: string; partyId: string }>;
}) {
  const { companySlug, partyId } = await params;
  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id,name,slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`load company failed: ${companyError.message}`);
  }

  if (!company) {
    throw new Error(`Company not found for slug: ${companySlug}`);
  }

  const party = await loadPartyForEdit({
    companyId: company.id,
    partyId,
    supabase,
  });

  async function updateParty(formData: FormData) {
    "use server";

    const name = String(formData.get("name") || "").trim();
    const emailRaw = String(formData.get("email") || "").trim();
    const typeRaw = String(formData.get("type") || "").trim();
    const externalIdRaw = String(formData.get("external_id") || "").trim();

    if (!name) {
      throw new Error("Name is required");
    }

    const supabase = await createClient();

    const { data: company } = await supabase
      .from("companies")
      .select("id,slug")
      .eq("slug", companySlug)
      .maybeSingle();

    if (!company) {
      throw new Error("Company not found");
    }

    await updatePartyRecord({
      companyId: company.id,
      partyId,
      name,
      email: emailRaw || null,
      type: typeRaw || null,
      externalId: externalIdRaw || null,
      supabase,
    });

    revalidatePath(`/c/${companySlug}/parties`);
    revalidatePath(`/c/${companySlug}/parties/${partyId}/edit`);
    redirect(`/c/${companySlug}/parties`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Edit party</h1>
          <p className="text-sm text-slate-500">
            Update rights holder / recipient for company: {company.name || company.slug}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/parties`}
          className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to parties
        </Link>
      </div>

      <form
        action={updateParty}
        className="max-w-3xl space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={party.name || ""}
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={party.email || ""}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>

          <div>
            <label
              htmlFor="type"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Type
            </label>
            <input
              id="type"
              name="type"
              type="text"
              defaultValue={party.type || ""}
              placeholder="artist, producer, songwriter..."
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="external_id"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              External ID
            </label>
            <input
              id="external_id"
              name="external_id"
              type="text"
              defaultValue={party.external_id || ""}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Save changes
          </button>

          <Link
            href={`/c/${companySlug}/parties`}
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}