"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StatementActions(props: {
  statementId: string;
  status: string;
  companySlug?: string; // ✅ make optional
}) {
  const { statementId, status, companySlug } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setStatus(next: "sent" | "paid" | "void") {
    if (busy) return;
    setBusy(true);
    setErr(null);

    try {
      const base = companySlug
        ? `/c/${companySlug}/statements/${statementId}`
        : `/statements/${statementId}`;

      const res = await fetch(`${base}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);

      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  const canSend = status === "draft";
  const canPay = status === "sent";
  const canVoid = status !== "void";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !canSend}
          onClick={() => setStatus("sent")}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Mark as sent
        </button>

        <button
          type="button"
          disabled={busy || !canPay}
          onClick={() => setStatus("paid")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
        >
          Mark as paid
        </button>

        <button
          type="button"
          disabled={busy || !canVoid}
          onClick={() => setStatus("void")}
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
        >
          Void
        </button>
      </div>

      {err ? <div className="text-sm text-rose-600">{err}</div> : null}
    </div>
  );
}