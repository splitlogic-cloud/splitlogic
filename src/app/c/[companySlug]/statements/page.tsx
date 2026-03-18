import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  generateStatementsFromAllocationRun,
  listStatementsByCompany,
} from "@/features/statements/statements.repo";
import {
  isPeriodLocked,
  listStatementPeriodLocks,
} from "@/features/statements/period-locks.repo";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ companySlug: string }>;
};

function fmtPeriod(periodStart: string | null | undefined, periodEnd: string | null | undefined) {
  if (!periodStart && !periodEnd) return "—";
  return `${periodStart ?? "—"} → ${periodEnd ?? "—"}`;
}

function fmtAmount(amount: number | null | undefined, currency = "SEK") {
  return `${(amount ?? 0).toFixed(2)} ${currency}`;
}

export default async function StatementsPage({ params }: PageProps) {
  const { companySlug } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  async function createStatement(formData: FormData) {
    "use server";

    const allocationRunId = String(formData.get("allocationRunId") ?? "");
    const periodStart = String(formData.get("periodStart") ?? "") || null;
    const periodEnd = String(formData.get("periodEnd") ?? "") || null;

    if (!allocationRunId) {
      throw new Error("Missing allocationRunId");
    }

    if (periodStart && periodEnd) {
      const locked = await isPeriodLocked({
        companyId: company.id,
        periodStart,
        periodEnd,
      });

      if (locked) {
        throw new Error("This period is already locked");
      }
    }

    await generateStatementsFromAllocationRun({
      companyId: company.id,
      allocationRunId,
      periodStart,
      periodEnd,
      createdBy: null,
    });

    revalidatePath(`/c/${companySlug}/statements`);
  }

  const [{ data: allocationRuns, error: allocationRunsError }, statements, locks] =
    await Promise.all([
      supabaseAdmin
        .from("allocation_runs")
        .select("id, created_at, status, total_input_rows, eligible_rows, allocated_rows")
        .eq("company_id", company.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(100),
      listStatementsByCompany(company.id, 200),
      listStatementPeriodLocks({ companyId: company.id }),
    ]);

  if (allocationRunsError) {
    throw new Error(`load allocation runs failed: ${allocationRunsError.message}`);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">Statements</div>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">
            Statements
          </h1>
          <div className="mt-2 text-sm text-slate-600">
            {company.name ?? company.slug} · generate, review, send and export statements.
          </div>
        </div>

        <a
          href={`/c/${companySlug}/statements/batch-export?companySlug=${companySlug}`}
          className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Batch export ZIP
        </a>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          Generate statements
        </h2>

        <form action={createStatement} className="mt-4 grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Allocation run
            </label>
            <select
              name="allocationRunId"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              required
            >
              <option value="">Select completed allocation run</option>
              {(allocationRuns ?? []).map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id} · {run.created_at} · rows {run.allocated_rows}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Period start
            </label>
            <input
              type="date"
              name="periodStart"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Period end
            </label>
            <input
              type="date"
              name="periodEnd"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>

          <div className="md:col-span-4">
            <button className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">
              Generate draft statements
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          Locked periods
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Allocation run</th>
                <th className="px-4 py-3 font-medium">Locked at</th>
              </tr>
            </thead>
            <tbody>
              {locks.length > 0 ? (
                locks.map((lock) => (
                  <tr key={lock.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      {lock.period_start} → {lock.period_end}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {lock.allocation_run_id ?? "—"}
                    </td>
                    <td className="px-4 py-3">{lock.locked_at}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-slate-500">
                    No locked periods yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Party</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Currency</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {statements.length > 0 ? (
              statements.map((statement) => (
                <tr key={statement.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{statement.created_at ?? "—"}</td>
                  <td className="px-4 py-3">{statement.party_name ?? "—"}</td>
                  <td className="px-4 py-3">{statement.status ?? "draft"}</td>
                  <td className="px-4 py-3">
                    {fmtPeriod(statement.period_start, statement.period_end)}
                  </td>
                  <td className="px-4 py-3">{statement.currency ?? "—"}</td>
                  <td className="px-4 py-3">
                    {fmtAmount(statement.total_amount, statement.currency ?? "SEK")}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/c/${companySlug}/statements/${statement.id}`}
                      className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-slate-500">
                  No statements yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}