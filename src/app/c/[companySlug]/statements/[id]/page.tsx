import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getStatementHeader,
  listStatementLines,
} from "@/features/statements/statements.repo";
import { listAuditEventsForEntity } from "@/features/audit/audit.repo";
import StatementActionsClient from "./StatementActionsClient";
import { addStatementNoteAction } from "@/features/statements/statements.actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
    statementId: string;
  }>;
};

function money(n: number, currency = "SEK") {
  return `${n.toFixed(2)} ${currency}`;
}

export default async function StatementDetailPage({ params }: PageProps) {
  const { companySlug, statementId } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, name, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  async function saveNote(formData: FormData) {
    "use server";
    formData.set("companySlug", companySlug);
    formData.set("statementId", statementId);
    await addStatementNoteAction(formData);
  }

  const [header, lines, auditEvents] = await Promise.all([
    getStatementHeader(company.id, statementId),
    listStatementLines(company.id, statementId),
    listAuditEventsForEntity({
      companyId: company.id,
      entityType: "statement",
      entityId: statementId,
      limit: 50,
    }),
  ]);

  if (!header) {
    throw new Error("Statement not found");
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">Statements / {statementId}</div>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">
            Statement detail
          </h1>
          <div className="mt-2 text-sm text-slate-600">
            {header.party_name ?? "Unnamed party"} · {header.status ?? "draft"}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/c/${companySlug}/statements`}
            className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Back
          </Link>
          <a
            href={`/c/${companySlug}/statements/${statementId}/export`}
            className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Export CSV
          </a>
        </div>
      </div>

      <StatementActionsClient
        companySlug={companySlug}
        statementId={statementId}
        status={header.status ?? "draft"}
        sentAt={header.sent_at ?? null}
        paidAt={header.paid_at ?? null}
        voidedAt={header.voided_at ?? null}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Party</div>
          <div className="mt-2 text-xl font-semibold">{header.party_name ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Period</div>
          <div className="mt-2 text-xl font-semibold">
            {header.period_start ?? "—"} → {header.period_end ?? "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Currency</div>
          <div className="mt-2 text-xl font-semibold">{header.currency ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total</div>
          <div className="mt-2 text-xl font-semibold">
            {money(header.total_amount ?? 0, header.currency ?? "SEK")}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Internal note</h2>
        <form action={saveNote} className="mt-4 space-y-3">
          <textarea
            name="note"
            defaultValue={header.note ?? ""}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Internal note for this statement"
          />
          <button className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50">
            Save note
          </button>
        </form>
      </section>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Work</th>
              <th className="px-4 py-3 font-medium">Source amount</th>
              <th className="px-4 py-3 font-medium">Share %</th>
              <th className="px-4 py-3 font-medium">Allocated</th>
              <th className="px-4 py-3 font-medium">Currency</th>
            </tr>
          </thead>
          <tbody>
            {lines.length > 0 ? (
              lines.map((line) => (
                <tr key={line.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{line.work_title ?? "Untitled work"}</td>
                  <td className="px-4 py-3">{line.source_amount.toFixed(6)}</td>
                  <td className="px-4 py-3">{line.share_percent.toFixed(6)}</td>
                  <td className="px-4 py-3 font-medium">
                    {line.allocated_amount.toFixed(6)}
                  </td>
                  <td className="px-4 py-3">{line.currency ?? "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-slate-500">
                  No statement lines.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Audit</h2>
        <div className="mt-4 space-y-3">
          {auditEvents.length > 0 ? (
            auditEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-200 p-4">
                <div className="text-sm font-medium text-slate-900">{event.action}</div>
                <div className="mt-1 text-xs text-slate-500">{event.created_at}</div>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
                  {JSON.stringify(event.payload ?? {}, null, 2)}
                </pre>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-500">No audit events for this statement.</div>
          )}
        </div>
      </section>
    </div>
  );
}