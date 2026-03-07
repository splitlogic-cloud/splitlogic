import "server-only";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { listPartiesMini } from "@/features/parties/parties.repo";
import { listWorkSplits } from "@/features/work-splits/work-splits.repo";

const ALLOWED_ROLES = [
  "artist",
  "producer",
  "writer",
  "label",
  "publisher",
  "manager",
  "other",
] as const;

const ALLOWED_TERRITORY_SCOPES = [
  "worldwide",
  "region",
  "country",
] as const;

export const dynamic = "force-dynamic";

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; workId: string }>;
}) {
  const { companySlug, workId } = await params;
  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error("Company not found");
  }

  const { data: work, error: workError } = await supabase
    .from("works")
    .select("id, company_id, title, external_id, isrc, created_at, updated_at")
    .eq("id", workId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (workError) {
    throw new Error(`Failed to load work: ${workError.message}`);
  }

  if (!work) {
    throw new Error("Work not found");
  }

  const parties = await listPartiesMini(company.id);
  const splits = await listWorkSplits(work.id);

  async function addSplit(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const partyId = String(formData.get("party_id") || "").trim();
    const role = String(formData.get("role") || "").trim().toLowerCase();
    const sharePercentRaw = String(formData.get("share_percent") || "").trim();
    const territoryScope = String(formData.get("territory_scope") || "").trim().toLowerCase();
    const territoryCodeRaw = String(formData.get("territory_code") || "").trim();
    const startDateRaw = String(formData.get("start_date") || "").trim();
    const endDateRaw = String(formData.get("end_date") || "").trim();

    if (!partyId) {
      throw new Error("Party is required");
    }

    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      throw new Error(`Invalid role: ${role}`);
    }

    if (
      !ALLOWED_TERRITORY_SCOPES.includes(
        territoryScope as (typeof ALLOWED_TERRITORY_SCOPES)[number]
      )
    ) {
      throw new Error(`Invalid territory scope: ${territoryScope}`);
    }

    const sharePercent = Number(sharePercentRaw.replace(",", "."));

    if (!Number.isFinite(sharePercent)) {
      throw new Error("Share percent must be a number");
    }

    if (sharePercent < 0 || sharePercent > 100) {
      throw new Error("Share percent must be between 0 and 100");
    }

    const territoryCode =
      territoryScope === "worldwide" ? null : territoryCodeRaw || null;

    if (territoryScope !== "worldwide" && !territoryCode) {
      throw new Error("Territory code is required for region/country");
    }

    const { error } = await supabase.from("work_splits").insert({
      company_id: company.id,
      work_id: work.id,
      party_id: partyId,
      role,
      share_percent: sharePercent,
      share_basis: "net",
      territory_scope: territoryScope,
      territory_code: territoryCode,
      start_date: startDateRaw || null,
      end_date: endDateRaw || null,
    });

    if (error) {
      throw new Error(`Failed to create split: ${error.message}`);
    }

    redirect(`/c/${companySlug}/works/${work.id}`);
  }

  async function deleteWork() {
    "use server";

    const supabase = await createClient();

    const { count, error: countError } = await supabase
      .from("work_splits")
      .select("id", { count: "exact", head: true })
      .eq("work_id", work.id);

    if (countError) {
      throw new Error(`Failed to validate delete: ${countError.message}`);
    }

    if ((count ?? 0) > 0) {
      throw new Error("Cannot delete work with splits. Remove splits first.");
    }

    const { error } = await supabase
      .from("works")
      .delete()
      .eq("id", work.id)
      .eq("company_id", company.id);

    if (error) {
      throw new Error(`Failed to delete work: ${error.message}`);
    }

    redirect(`/c/${companySlug}/works`);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <a
          href={`/c/${companySlug}/works`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to works
        </a>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{work.title}</h1>
            <p className="text-sm text-slate-500">
              Work detail and royalty split setup
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href={`/c/${companySlug}/works/${work.id}/edit`}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit work
            </Link>

            <form action={deleteWork}>
              <button
                type="submit"
                className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete work
              </button>
            </form>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Work info</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Title</div>
            <div className="mt-1 text-sm text-slate-900">{work.title}</div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">ISRC</div>
            <div className="mt-1 text-sm text-slate-900">{work.isrc || "—"}</div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">External ID</div>
            <div className="mt-1 break-all text-sm text-slate-900">
              {work.external_id || "—"}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Created</div>
            <div className="mt-1 text-sm text-slate-900">
              {work.created_at ? new Date(work.created_at).toLocaleString() : "—"}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">Splits</h2>
          <p className="text-sm text-slate-500">
            Add parties, percentages, roles and territory rules for this work.
          </p>
        </div>

        {splits.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
            No splits added yet.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">Party</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">Role</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">Share %</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">Territory</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">Code</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">Start</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">End</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((split) => (
                  <tr key={split.id}>
                    <td className="border-b border-slate-100 px-3 py-2">
                      {split.party_name || split.party_id}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">{split.role}</td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      {split.share_percent}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      {split.territory_scope}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      {split.territory_code || "—"}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      {split.start_date || "—"}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      {split.end_date || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Add split</h2>

        {parties.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-amber-800">
            You need at least one party before you can add a split.
          </div>
        ) : (
          <form action={addSplit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="party_id" className="text-sm font-medium">
                Party
              </label>
              <select
                id="party_id"
                name="party_id"
                required
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Select party
                </option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="role" className="text-sm font-medium">
                Role
              </label>
              <select
                id="role"
                name="role"
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

            <div className="space-y-1">
              <label htmlFor="share_percent" className="text-sm font-medium">
                Share %
              </label>
              <input
                id="share_percent"
                name="share_percent"
                required
                inputMode="decimal"
                placeholder="e.g. 25"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="territory_scope" className="text-sm font-medium">
                Territory scope
              </label>
              <select
                id="territory_scope"
                name="territory_scope"
                defaultValue="worldwide"
                required
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="worldwide">Worldwide</option>
                <option value="region">Region</option>
                <option value="country">Country</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="territory_code" className="text-sm font-medium">
                Territory code
              </label>
              <input
                id="territory_code"
                name="territory_code"
                placeholder="e.g. nordics / europe / SE / US"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="start_date" className="text-sm font-medium">
                Start date
              </label>
              <input
                id="start_date"
                name="start_date"
                type="date"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="end_date" className="text-sm font-medium">
                End date
              </label>
              <input
                id="end_date"
                name="end_date"
                type="date"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Add split
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}