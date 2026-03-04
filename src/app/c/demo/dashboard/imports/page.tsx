import { AppShell } from "@/components/AppShell";

const rows = [
  { id: "j4a253a6-...-7799", file: "splits_2026-03.csv", status: "Completed", warnings: 12, count: 65262 },
  { id: "j4a433a6-...-7799", file: "splits_2026-02.csv", status: "Processing", warnings: 3, count: 32111 },
  { id: "j4a533a6-...-7799", file: "splits_2026-01.csv", status: "Failed", warnings: 0, count: 0 },
];

export default function Page() {
  return (
    <AppShell title="Imports" active="/c/demo/imports">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-slate-500">Översikt över importer</div>
        <button className="rounded-xl px-4 py-2 font-medium text-white bg-gradient-to-r from-cyan-500 to-violet-500">
          Ny import
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left p-3">Import ID</th>
              <th className="text-left p-3">Fil</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Warnings</th>
              <th className="text-right p-3">Rows</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-200 bg-white">
                <td className="p-3 font-mono text-xs text-slate-600">{r.id}</td>
                <td className="p-3">{r.file}</td>
                <td className="p-3">
                  <StatusPill status={r.status} />
                </td>
                <td className="p-3 text-right">{r.warnings}</td>
                <td className="p-3 text-right">{r.count.toLocaleString("sv-SE")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function StatusPill({ status }: { status: string }) {
  const base = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";
  if (status === "Completed") return <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}>Completed</span>;
  if (status === "Processing") return <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>Processing</span>;
  return <span className={`${base} bg-rose-50 text-rose-700 border-rose-200`}>Failed</span>;
}