import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import DeleteWorkButton from "./DeleteWorkButton";

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

type WorkRow = {
  id: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  normalized_title: string | null;
  normalized_artist: string | null;
  normalized_isrc: string | null;
  created_at: string | null;
};

type SplitRow = {
  id: string;
  work_id: string;
  share_percent: number | string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sv-SE");
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function getSplitStatus(splitCount: number, splitTotal: number) {
  if (splitCount === 0) {
    return {
      label: "Missing splits",
      className:
        "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
    };
  }

  if (Math.abs(splitTotal - 100) < 0.000001) {
    return {
      label: "Valid",
      className:
        "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    };
  }

  return {
    label: "Invalid",
    className:
      "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  };
}

export default async function WorksPage({ params }: PageProps) {
  const { companySlug } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle<CompanyRecord>();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const [
    { data: works, error: worksError },
    { data: splits, error: splitsError },
  ] = await Promise.all([
    supabaseAdmin
      .from("works")
      .select(
        `
          id,
          title,
          artist,
          isrc,
          normalized_title,
          normalized_artist,
          normalized_isrc,
          created_at
        `
      )
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(500),

    supabaseAdmin
      .from("splits")
      .select("id, work_id, share_percent")
      .eq("company_id", company.id),
  ]);

  if (worksError) {
    throw new Error(`Failed to load works: ${worksError.message}`);
  }

  if (splitsError) {
    throw new Error(`Failed to load splits: ${splitsError.message}`);
  }

  const workRows = (works ?? []) as WorkRow[];
  const splitRows = (splits ?? []) as SplitRow[];

  const splitSummaryByWorkId = new Map<
    string,
    { splitCount: number; splitTotal: number }
  >();

  for (const split of splitRows) {
    const current = splitSummaryByWorkId.get(split.work_id) ?? {
      splitCount: 0,
      splitTotal: 0,
    };

    current.splitCount += 1;
    current.splitTotal += Number(split.share_percent ?? 0);

    splitSummaryByWorkId.set(split.work_id, current);
  }

  const rows = workRows.map((work) => {
    const summary = splitSummaryByWorkId.get(work.id) ?? {
      splitCount: 0,
      splitTotal: 0,
    };

    return {
      ...work,
      splitCount: summary.splitCount,
      splitTotal: summary.splitTotal,
      status: getSplitStatus(summary.splitCount, summary.splitTotal),
    };
  });

  const validCount = rows.filter(
    (row) => row.splitCount > 0 && Math.abs(row.splitTotal - 100) < 0.000001
  ).length;

  const missingCount = rows.filter((row) => row.splitCount === 0).length;

  const invalidCount = rows.length - validCount - missingCount;

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
            / <span className="text-zinc-900">Works</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            Works
          </h1>

          <div className="text-sm text-zinc-600">
            <span className="font-medium">{company.name ?? company.slug}</span>
            {" · "}
            {rows.length} works shown
          </div>
        </div>

        <div className="grid min-w-[260px] grid-cols-3 gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Valid
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-700">
              {validCount}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Invalid
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-700">
              {invalidCount}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Missing
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-700">
              {missingCount}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
        <div className="font-medium text-zinc-900">Catalog status</div>
        <div className="mt-1 text-zinc-600">
          Review imported works, fix missing or invalid splits, then rerun allocation.
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr className="border-b border-zinc-200">
              <th className="px-4 py-3 font-semibold text-zinc-700">Title</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Artist</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">ISRC</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Splits</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Total %</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Status</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Created</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Action</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
                  No works found for this company.
                </td>
              </tr>
            ) : (
              rows.map((work) => (
                <tr key={work.id} className="border-b border-zinc-100 align-top">
                  <td className="px-4 py-4">
                    <div className="font-medium text-zinc-900">
                      {work.title || "—"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      norm: {work.normalized_title || "—"}
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <div className="text-zinc-700">{work.artist || "—"}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      norm: {work.normalized_artist || "—"}
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <div className="text-zinc-700">{work.isrc || "—"}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      norm: {work.normalized_isrc || "—"}
                    </div>
                  </td>

                  <td className="px-4 py-4 text-zinc-700">{work.splitCount}</td>

                  <td className="px-4 py-4 text-zinc-700">
                    {formatPercent(work.splitTotal)}
                  </td>

                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${work.status.className}`}
                    >
                      {work.status.label}
                    </span>
                  </td>

                  <td className="px-4 py-4 text-zinc-700">
                    {formatDate(work.created_at)}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/c/${companySlug}/works/${work.id}`}
                        className="inline-flex items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Open
                      </Link>

                      <Link
                        href={`/c/${companySlug}/works/${work.id}/splits`}
                        className="inline-flex items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Splits
                      </Link>

                      <Link
                        href={`/c/${companySlug}/works/${work.id}/edit`}
                        className="inline-flex items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Edit
                      </Link>

                      <DeleteWorkButton
                        companySlug={companySlug}
                        workId={work.id}
                      />
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