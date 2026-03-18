import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getWorkSplitCoverageSummary,
  listWorkSplitCoverage,
} from "@/features/splits/coverage.repo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ importId?: string }>;
};

function badge(status: "missing" | "invalid" | "valid") {
  if (status === "valid") {
    return "inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200";
  }

  if (status === "invalid") {
    return "inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200";
  }

  return "inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200";
}

function titleCase(status: "missing" | "invalid" | "valid") {
  if (status === "missing") return "Missing splits";
  if (status === "invalid") return "Invalid total";
  return "Valid";
}

export default async function WorkCoveragePage({
  params,
  searchParams,
}: PageProps) {
  const { companySlug } = await params;
  const { importId } = await searchParams;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  const [summary, rows] = await Promise.all([
    getWorkSplitCoverageSummary({
      companyId: company.id,
      importId: importId ?? null,
    }),
    listWorkSplitCoverage({
      companyId: company.id,
      importId: importId ?? null,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <div className="text-sm text-slate-500">Works / Coverage</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">
          Split coverage
        </h1>
        <div className="mt-2 text-sm text-slate-600">
          {company.name ?? company.slug} · fix missing or invalid splits before
          statements.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Total works
          </div>
          <div className="mt-2 text-3xl font-semibold">{summary.totalWorks}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Missing
          </div>
          <div className="mt-2 text-3xl font-semibold text-rose-700">
            {summary.missing}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Invalid
          </div>
          <div className="mt-2 text-3xl font-semibold text-amber-700">
            {summary.invalid}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Blocked rows
          </div>
          <div className="mt-2 text-3xl font-semibold">{summary.blockedRows}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Work</th>
              <th className="px-4 py-3 font-medium">ISRC</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Split rows</th>
              <th className="px-4 py-3 font-medium">Split total</th>
              <th className="px-4 py-3 font-medium">Blocked rows</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.workId} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {row.workTitle}
                </td>
                <td className="px-4 py-3 text-slate-600">{row.workIsrc || "—"}</td>
                <td className="px-4 py-3">
                  <span className={badge(row.status)}>{titleCase(row.status)}</span>
                </td>
                <td className="px-4 py-3">{row.splitCount}</td>
                <td className="px-4 py-3">{row.splitTotal.toFixed(6)}</td>
                <td className="px-4 py-3">{row.blockedRows}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/c/${companySlug}/works/${row.workId}/splits`}
                    className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                  >
                    Open splits
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}