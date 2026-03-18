"use client";

import { useTransition } from "react";
import { setStatementStatusAction } from "@/features/statements/statements.actions";

function badge(status: string) {
  if (status === "sent") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (status === "paid") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "void") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default function StatementActionsClient(props: {
  companySlug: string;
  statementId: string;
  status: string;
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  function setStatus(nextStatus: "draft" | "sent" | "paid" | "void") {
    const formData = new FormData();
    formData.set("companySlug", props.companySlug);
    formData.set("statementId", props.statementId);
    formData.set("nextStatus", nextStatus);

    startTransition(async () => {
      await setStatementStatusAction(formData);
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Status</div>
          <div className="mt-2">
            <span
              className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${badge(
                props.status
              )}`}
            >
              {props.status}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatus("sent")}
            disabled={isPending}
            className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
          >
            Mark sent
          </button>
          <button
            onClick={() => setStatus("paid")}
            disabled={isPending}
            className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
          >
            Mark paid
          </button>
          <button
            onClick={() => setStatus("void")}
            disabled={isPending}
            className="inline-flex rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
          >
            Void
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Sent at</div>
          <div className="mt-1">{fmtDate(props.sentAt)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Paid at</div>
          <div className="mt-1">{fmtDate(props.paidAt)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Voided at</div>
          <div className="mt-1">{fmtDate(props.voidedAt)}</div>
        </div>
      </div>
    </div>
  );
}