import { supabaseAdmin } from "@/lib/supabase/admin";
import { updateSplitAction } from "./actions";
import CreateSplitForm from "./CreateSplitForm";
import DeleteSplitButton from "./DeleteSplitButton";

type PageProps = {
  params: Promise<{
    companySlug: string;
    workId: string;
  }>;
};

type Party = {
  id: string;
  name: string | null;
  type: string | null;
};

type Split = {
  id: string;
  party_id: string;
  role: string | null;
  share_percent: number | null;
  parties: Party | Party[] | null;
};

function toSingleParty(joinedParty: Party | Party[] | null): Party | null {
  if (!joinedParty) return null;
  return Array.isArray(joinedParty) ? joinedParty[0] ?? null : joinedParty;
}

function formatPercent(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, "");
}

export default async function SplitsPage({ params }: PageProps) {
  const { companySlug, workId } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error("Company not found");
  }

  const { data: work, error: workError } = await supabaseAdmin
    .from("works")
    .select("id, title")
    .eq("id", workId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (workError) {
    throw new Error(`Failed to load work: ${workError.message}`);
  }

  if (!work) {
    throw new Error("Work not found");
  }

  const { data: splitsData, error: splitsError } = await supabaseAdmin
    .from("splits")
    .select("id, party_id, role, share_percent, parties(id, name, type)")
    .eq("company_id", company.id)
    .eq("work_id", work.id);

  if (splitsError) {
    throw new Error(`Failed to load splits: ${splitsError.message}`);
  }

  const { data: partiesData, error: partiesError } = await supabaseAdmin
    .from("parties")
    .select("id, name, type")
    .eq("company_id", company.id)
    .order("name", { ascending: true });

  if (partiesError) {
    throw new Error(`Failed to load parties: ${partiesError.message}`);
  }

  const splits = (splitsData ?? []) as Split[];
  const parties = (partiesData ?? []) as Party[];
  const totalShare = splits.reduce(
    (sum, split) => sum + Number(split.share_percent ?? 0),
    0
  );
  const isComplete = Math.abs(totalShare - 100) < 0.000001;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Splits</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage split setup for <span className="font-medium">{work.title}</span>.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        Total share:{" "}
        <span className={isComplete ? "text-green-600" : "text-red-600"}>
          {formatPercent(totalShare)}%
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="border-b border-zinc-200 px-4 py-3 font-medium">Party</th>
              <th className="border-b border-zinc-200 px-4 py-3 font-medium">Role</th>
              <th className="border-b border-zinc-200 px-4 py-3 font-medium">Share %</th>
              <th className="border-b border-zinc-200 px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {splits.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-zinc-500">
                  No splits added yet.
                </td>
              </tr>
            ) : (
              splits.map((split) => {
                const party = toSingleParty(split.parties);
                return (
                  <tr key={split.id}>
                    <td className="border-b border-zinc-100 px-4 py-3">
                      {party?.name ?? split.party_id}
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3">
                      <form action={updateSplitAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="companySlug" value={companySlug} />
                        <input type="hidden" name="workId" value={workId} />
                        <input type="hidden" name="splitId" value={split.id} />

                        <input
                          type="text"
                          name="role"
                          defaultValue={split.role ?? ""}
                          placeholder="role"
                          className="w-40 rounded-md border border-zinc-300 px-2 py-1"
                        />

                        <input
                          type="number"
                          name="sharePercent"
                          min="0"
                          max="100"
                          step="0.000001"
                          defaultValue={split.share_percent ?? 0}
                          className="w-28 rounded-md border border-zinc-300 px-2 py-1"
                        />

                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-50"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3">
                      {formatPercent(Number(split.share_percent ?? 0))}
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3">
                      <DeleteSplitButton
                        companySlug={companySlug}
                        workId={workId}
                        splitId={split.id}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Add split</h2>
        <CreateSplitForm companySlug={companySlug} workId={workId} parties={parties} />
      </div>
    </div>
  );
}