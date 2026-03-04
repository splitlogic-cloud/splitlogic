import { AppShell } from "@/components/AppShell";

export default function Page() {
  return (
    <AppShell title="Dashboard" active="/c/demo/dashboard">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi title="Senaste import" value="2026-03-01" />
        <Kpi title="Rader processade" value="65 262" />
        <Kpi title="Warnings" value="12" />
      </div>

      <div className="mt-6 flex gap-3">
        <button className="rounded-xl px-4 py-2 font-medium text-white bg-gradient-to-r from-cyan-500 to-violet-500">
          Ny import
        </button>
        <button className="rounded-xl px-4 py-2 font-medium border border-slate-200 bg-white hover:bg-slate-50">
          Visa audit
        </button>
      </div>
    </AppShell>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}