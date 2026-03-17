import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getSplitTotalForWork,
  listPartiesForCompany,
  listSplitsForWork,
} from "@/features/splits/splits.repo";
import CreateSplitForm from "./CreateSplitForm";
import DeleteSplitButton from "./DeleteSplitButton";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    companySlug: string;
    workId: string;
  }>;
};

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

export default async function WorkSplitsPage({ params }: Params) {
  const { companySlug, workId } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const { data: work, error: workError } = await supabaseAdmin
    .from("works")
    .select("id, company_id, title, artist, isrc")
    .eq("id", workId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (workError) {
    throw new Error(`Failed to load work: ${workError.message}`);
  }

  if (!work) {
    notFound();
  }

  const [splits, parties, splitTotal] = await Promise.all([
    listSplitsForWork(work.id),
    listPartiesForCompany(company.id),
    getSplitTotalForWork(work.id),
  ]);

  const isComplete = Math.abs(splitTotal - 100) < 0.000001;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="text-sm text-zinc-500">
            <Link
              href={`/c/${companySlug}/works`}
              className="hover:text-zinc-900 hover:underline"
            >
              Works
            </Link>{" "}
            / <span className="text-zinc-900">{work.id}</span> / Splits
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            Work splits
          </h1>

          <div className="text-sm text-zinc-600">
            <span className="font-medium">{work.title ?? "Untitled"}</span>
            {" · "}
            {work.artist ?? "Unknown artist"}
            {" · "}
            {work.isrc ?? "No ISRC"}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Split total
          </div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">
            {formatPercent(splitTotal)}
          </div>
          <div className={`mt-1 text-sm ${isComplete ? "text-emerald-600" : "text-amber-600"}`}>
            {isComplete ? "Ready for allocation" : "Must equal 100%"}
          </div>
        </div>
      </div>

      <CreateSplitForm
        companySlug={companySlug}
        workId={work.id}
        parties={parties as any[]}
      />

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr className="border-b border-zinc-200">
              <th className="px-4 py-3 font-semibold text-zinc-700">Party</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Type</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Role</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Share %</th>
              <th className="px-4 py-3 font-semibold text-zinc-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {splits.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No splits yet.
                </td>
              </tr>
            ) : (
              splits.map((split) => (
                <tr key={split.id} className="border-b border-zinc-100">
                  <td className="px-4 py-4 font-medium text-zinc-900">
                    {split.party_name ?? "Unknown party"}
                  </td>
                  <td className="px-4 py-4 text-zinc-700">
                    {split.party_type ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-zinc-700">
                    {split.role ?? "—"}
                  </td>
                  <td className="px-4 py-4 text-zinc-700">
                    {formatPercent(Number(split.share_percent))}
                  </td>
                  <td className="px-4 py-4">
                    <DeleteSplitButton
                      companySlug={companySlug}
                      workId={work.id}
                      splitId={split.id}
                    />
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