import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listStatementsByCompany } from "@/features/statements/statements.repo";
import {
  listStatementQaStatusesByCompany,
  type QaLevel,
} from "@/features/statements/statements-qa.repo";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    companySlug: string;
  }>;
};

function formatMoney(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  const rounded = new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return currency ? `${rounded} ${currency}` : rounded;
}

function badgeClass(level: QaLevel) {
  if (level === "ok") return "bg-green-100 text-green-800 border-green-200";
  if (level === "warning") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function badgeLabel(level: QaLevel) {
  if (level === "ok") return "OK";
  if (level === "warning") return "Needs review";
  return "Blocked";
}

export default async function StatementsPage({ params }: Params) {
  const { companySlug } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id,slug,name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    notFound();
  }

  const statements = await listStatementsByCompany(company.id);
  const qaMap = await listStatementQaStatusesByCompany(company.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-neutral-500">Statements</div>
          <h1 className="text-2xl font-semibold tracking-tight">Statements</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Statements are period-based and generated from allocation ledger rows.
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/statements/generate`}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Generate statements
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Party</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Period</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Total</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">QA</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Created</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {statements.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  No statements yet.
                </td>
              </tr>
            ) : (
              statements.map((row) => {
                const qa = qaMap.get(row.id);
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3">{row.party_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {row.period_start ?? "—"} → {row.period_end ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {formatMoney(row.total_amount, row.currency)}
                    </td>
                    <td className="px-4 py-3">{row.status ?? "—"}</td>
                    <td className="px-4 py-3">
                      {qa ? (
                        <span className={`rounded-full border px-2 py-1 text-xs font-medium ${badgeClass(qa.level)}`}>
                          {badgeLabel(qa.level)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">{row.created_at ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/c/${companySlug}/statements/${row.id}`}
                        className="underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}