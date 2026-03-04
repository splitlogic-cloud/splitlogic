"use client";

import { useEffect, useState } from "react";

type Props = { companyId: string; importJobId: string };

type ImportJob = {
  id: string;
  status?: string | null;
  source?: string | null;
  filename?: string | null;
  created_at?: string | null;
};

type ImportRow = {
  id: string;
  row_number?: number | null;
  status?: string | null;
  error?: string | null;
  raw?: any;
};

export default function ImportRowClient({ companyId, importJobId }: Props) {
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setBusy(true);
      setErr(null);

      try {
        const res = await fetch(`/api/imports/view`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyId, importJobId }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? `Load failed (${res.status})`);

        if (cancelled) return;
        setJob(json.job ?? null);
        setRows(json.rows ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setErr(String(e?.message ?? e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, importJobId]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {busy && <div>Laddar…</div>}

      {err && (
        <div style={{ color: "crimson", whiteSpace: "pre-wrap" }}>
          {err}
        </div>
      )}

      {job && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Job</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            Status: <b>{job.status ?? "?"}</b>{" "}
            {job.filename ? (
              <>
                · File: <b>{job.filename}</b>
              </>
            ) : null}
            {job.source ? (
              <>
                {" "}
                · Source: <b>{job.source}</b>
              </>
            ) : null}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>
          Import rows ({rows.length})
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.03)" }}>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>#</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>status</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.id ?? idx}>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {r.row_number ?? idx + 1}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {r.status ?? ""}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.06)", whiteSpace: "pre-wrap" }}>
                    {r.error ?? ""}
                  </td>
                </tr>
              ))}
              {!rows.length && !busy && (
                <tr>
                  <td colSpan={3} style={{ padding: 12, opacity: 0.7 }}>
                    Inga rader ännu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}