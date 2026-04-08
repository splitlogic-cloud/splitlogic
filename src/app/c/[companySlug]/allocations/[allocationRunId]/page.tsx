import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getAllocationQASummary,
  listAllocationQABlockers,
  listAllocationQARows,
} from "@/features/allocations/allocation-qa.repo";
import AllocationQATablesClient from "./AllocationQATablesClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
    allocationRunId: string;
  }>;
};

export default async function AllocationQAPage({ params }: PageProps) {
  const { companySlug, allocationRunId } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  const [summary, rows, blockers] = await Promise.all([
    getAllocationQASummary({ allocationRunId }),
    listAllocationQARows({ allocationRunId, limit: null }),
    listAllocationQABlockers({ allocationRunId }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <div className="text-sm text-slate-500">Allocations / QA</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">
          Allocation QA
        </h1>
        <div className="mt-2 text-sm text-slate-600">
          {company.name ?? company.slug} · Run {allocationRunId}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Allocation rows
          </div>
          <div className="mt-2 text-3xl font-semibold">{summary.rowCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Total allocated
          </div>
          <div className="mt-2 text-3xl font-semibold">
            {summary.totalAllocated.toFixed(6)}
          </div>
          <div className="mt-1 text-sm text-slate-500">{summary.currency || "Mixed"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Parties
          </div>
          <div className="mt-2 text-3xl font-semibold">{summary.partyCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Works
          </div>
          <div className="mt-2 text-3xl font-semibold">{summary.workCount}</div>
        </div>
      </div>

      <AllocationQATablesClient
        companySlug={companySlug}
        rows={rows}
        blockers={blockers}
      />
    </div>
  );
}