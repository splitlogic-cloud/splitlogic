"use client";

export default function StatementActions({
  statementId,
  status,
}: {
  statementId: string;
  status: string;
}) {
  // Placeholder tills du kopplar RPC: statement_mark_sent/paid/void
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="h-9 rounded-md border px-3 text-xs font-medium hover:bg-slate-50"
        onClick={() => alert(`TODO: mark SENT for ${statementId}`)}
        disabled={status !== "draft"}
      >
        Mark sent
      </button>
      <button
        type="button"
        className="h-9 rounded-md border px-3 text-xs font-medium hover:bg-slate-50"
        onClick={() => alert(`TODO: mark PAID for ${statementId}`)}
        disabled={status !== "sent"}
      >
        Mark paid
      </button>
      <button
        type="button"
        className="h-9 rounded-md border px-3 text-xs font-medium hover:bg-slate-50"
        onClick={() => alert(`TODO: void ${statementId}`)}
      >
        Void
      </button>
    </div>
  );
}