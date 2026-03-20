import "server-only";

import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

async function createRule(formData: FormData) {
  "use server";

  const companySlug = String(formData.get("companySlug") ?? "").trim();
  const ruleName = String(formData.get("ruleName") ?? "").trim();
  const partyId = String(formData.get("partyId") ?? "").trim();
  const releaseIdRaw = String(formData.get("releaseId") ?? "").trim();
  const workIdRaw = String(formData.get("workId") ?? "").trim();
  const ratePercentRaw = String(formData.get("ratePercent") ?? "").trim();
  const rateBase = String(formData.get("rateBase") ?? "net").trim();
  const baseRatePercentRaw = String(formData.get("baseRatePercent") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "100").trim();

  if (!companySlug) {
    throw new Error("Missing companySlug");
  }

  if (!ruleName) {
    throw new Error("Rule name is required");
  }

  if (!partyId) {
    throw new Error("Party is required");
  }

  const ratePercent = Number(ratePercentRaw.replace(",", "."));
  const baseRatePercent = Number((baseRatePercentRaw || "100").replace(",", "."));
  const priority = Number((priorityRaw || "100").replace(",", "."));

  if (!Number.isFinite(ratePercent)) {
    throw new Error("ratePercent must be a valid number");
  }

  if (!Number.isFinite(baseRatePercent)) {
    throw new Error("baseRatePercent must be a valid number");
  }

  if (!Number.isFinite(priority)) {
    throw new Error("priority must be a valid number");
  }

  if (!["net", "gross", "ppd"].includes(rateBase)) {
    throw new Error("rateBase must be net, gross, or ppd");
  }

  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(companyError.message);
  }

  if (!company) {
    throw new Error("Company not found");
  }

  const payload = {
    company_id: company.id,
    rule_name: ruleName,
    party_id: partyId,
    release_id: releaseIdRaw || null,
    work_id: workIdRaw || null,
    rate_percent: ratePercent,
    rate_base: rateBase,
    base_rate_percent: baseRatePercent,
    priority,
    is_active: true,
  };

  const { error: insertError } = await supabase
    .from("allocation_rules")
    .insert(payload);

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/c/${companySlug}/allocations/rules`);
  redirect(`/c/${companySlug}/allocations/rules`);
}

export default async function AllocationRulesPage({ params }: PageProps) {
  const { companySlug } = await params;
  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(companyError.message);
  }

  if (!company) {
    notFound();
  }

  const [{ data: parties, error: partiesError }, { data: releases, error: releasesError }, { data: works, error: worksError }, { data: rules, error: rulesError }] =
    await Promise.all([
      supabase
        .from("parties")
        .select("id, name, type")
        .eq("company_id", company.id)
        .order("name", { ascending: true }),
      supabase
        .from("releases")
        .select("id, title")
        .eq("company_id", company.id)
        .order("title", { ascending: true }),
      supabase
        .from("works")
        .select("id, title")
        .eq("company_id", company.id)
        .order("title", { ascending: true }),
      supabase
        .from("allocation_rules")
        .select(`
          id,
          rule_name,
          party_id,
          release_id,
          work_id,
          rate_percent,
          rate_base,
          base_rate_percent,
          priority,
          is_active,
          created_at
        `)
        .eq("company_id", company.id)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false }),
    ]);

  if (partiesError) {
    throw new Error(partiesError.message);
  }

  if (releasesError) {
    throw new Error(releasesError.message);
  }

  if (worksError) {
    throw new Error(worksError.message);
  }

  if (rulesError) {
    throw new Error(rulesError.message);
  }

  const partyMap = new Map((parties ?? []).map((p) => [p.id, p]));
  const releaseMap = new Map((releases ?? []).map((r) => [r.id, r]));
  const workMap = new Map((works ?? []).map((w) => [w.id, w]));

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Allocation Rules</h1>
        <p className="text-sm text-neutral-600">
          Company: {company.name ?? company.slug}
        </p>
      </div>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Create new rule</h2>

        <form action={createRule} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <input type="hidden" name="companySlug" value={companySlug} />

          <div className="space-y-1">
            <label className="text-sm font-medium">Rule name</label>
            <input
              name="ruleName"
              type="text"
              required
              placeholder="Example: Artist net 20%"
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Party</label>
            <select
              name="partyId"
              required
              defaultValue=""
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="" disabled>
                Select party
              </option>
              {(parties ?? []).map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name} {party.type ? `(${party.type})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Release scope</label>
            <select
              name="releaseId"
              defaultValue=""
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="">All releases</option>
              {(releases ?? []).map((release) => (
                <option key={release.id} value={release.id}>
                  {release.title ?? release.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Work scope</label>
            <select
              name="workId"
              defaultValue=""
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="">All works</option>
              {(works ?? []).map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title ?? work.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Rate %</label>
            <input
              name="ratePercent"
              type="number"
              step="0.0001"
              required
              placeholder="20"
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Rate base</label>
            <select
              name="rateBase"
              defaultValue="net"
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="net">net</option>
              <option value="gross">gross</option>
              <option value="ppd">ppd</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Base rate %</label>
            <input
              name="baseRatePercent"
              type="number"
              step="0.0001"
              defaultValue="100"
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Priority</label>
            <input
              name="priority"
              type="number"
              step="1"
              defaultValue="100"
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div className="md:col-span-2 xl:col-span-3">
            <button
              type="submit"
              className="rounded-xl bg-black px-4 py-2 text-white"
            >
              Save rule
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Existing rules</h2>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-3 py-2">Rule</th>
                <th className="px-3 py-2">Party</th>
                <th className="px-3 py-2">Release</th>
                <th className="px-3 py-2">Work</th>
                <th className="px-3 py-2">Rate %</th>
                <th className="px-3 py-2">Base</th>
                <th className="px-3 py-2">Base rate %</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {(rules ?? []).map((rule) => (
                <tr key={rule.id} className="border-b align-top">
                  <td className="px-3 py-2">{rule.rule_name}</td>
                  <td className="px-3 py-2">
                    {partyMap.get(rule.party_id)?.name ?? rule.party_id}
                  </td>
                  <td className="px-3 py-2">
                    {rule.release_id
                      ? (releaseMap.get(rule.release_id)?.title ?? rule.release_id)
                      : "All"}
                  </td>
                  <td className="px-3 py-2">
                    {rule.work_id
                      ? (workMap.get(rule.work_id)?.title ?? rule.work_id)
                      : "All"}
                  </td>
                  <td className="px-3 py-2">{rule.rate_percent}</td>
                  <td className="px-3 py-2">{rule.rate_base}</td>
                  <td className="px-3 py-2">{rule.base_rate_percent ?? 100}</td>
                  <td className="px-3 py-2">{rule.priority ?? 100}</td>
                  <td className="px-3 py-2">{rule.is_active ? "Yes" : "No"}</td>
                </tr>
              ))}

              {(!rules || rules.length === 0) && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-neutral-500">
                    No allocation rules yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}