import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStatementById } from "@/features/statements/statements.repo";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    companySlug: string;
    id: string;
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

export default async function StatementDetailPage({ params }: Params) {
  const { companySlug, id } = await params;

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

  const statement = await getStatementById(company.id, id);

  if (!statement) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-neutral-500">
            <Link href={`/c/${companySlug}/statements`} className="underline">
              Statements
            </Link>{" "}
            / Detail
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {statement.party_name ?? "Statement"}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {statement.period_start ?? "—"} → {statement.period_end ?? "—"}
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Total
          </div>
          <div className="text-2xl font-semibold">
            {formatMoney(statement.total_amount, statement.currency)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Status
          </div>
          <div className="mt-2 text-lg font-semibold">
            {statement.status ?? "—"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Source
          </div>
          <div className="mt-2 text-lg font-semibold">
            {statement.generated_from ?? "—"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Currency
          </div>
          <div className="mt-2 text-lg font-semibold">
            {statement.currency ?? "Mixed / none"}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Created
          </div>
          <div className="mt-2 text-lg font-semibold">
            {statement.created_at ?? "—"}
          </div>
        </div>
      </div>

      {statement.note ? (
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm font-medium">Note</div>
          <div className="mt-2 text-sm text-neutral-700">{statement.note}</div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Line
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Work
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Row count
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Amount
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {statement.lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  No statement lines found.
                </td>
              </tr>
            ) : (
              statement.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3">{line.line_label}</td>
                  <td className="px-4 py-3">{line.work_title ?? "—"}</td>
                  <td className="px-4 py-3">{line.row_count ?? 0}</td>
                  <td className="px-4 py-3">
                    {formatMoney(line.amount, line.currency)}
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