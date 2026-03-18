import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getAllocationQASummary,
  listAllocationQARows,
} from "@/features/allocations/allocation-qa.repo";

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

  const [summary, rows] = await Promise.all([
    getAllocationQASummary({ allocationRunId }),
    listAllocationQARows({ allocationRunId, limit: 500 }),
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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Work</th>
              <th className="px-4 py-3 font-medium">Party</th>
              <th className="px-4 py-3 font-medium">Source amount</th>
              <th className="px-4 py-3 font-medium">Share %</th>
              <th className="px-4 py-3 font-medium">Allocated</th>
              <th className="px-4 py-3 font-medium">Currency</th>
              <th className="px-4 py-3 font-medium">Links</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.allocationRowId} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{row.workTitle}</div>
                  <div className="text-xs text-slate-500">{row.workId}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{row.partyName}</div>
                  <div className="text-xs text-slate-500">{row.partyId}</div>
                </td>
                <td className="px-4 py-3">{row.sourceAmount.toFixed(6)}</td>
                <td className="px-4 py-3">{row.sharePercent.toFixed(6)}</td>
                <td className="px-4 py-3 font-medium">{row.allocatedAmount.toFixed(6)}</td>
                <td className="px-4 py-3">{row.currency || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/c/${companySlug}/works/${row.workId}/splits`}
                      className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                    >
                      Work splits
                    </Link>
                    <Link
                      href={`/c/${companySlug}/parties/${row.partyId}`}
                      className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                    >
                      Party
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}