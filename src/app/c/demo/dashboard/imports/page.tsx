import "server-only";

import { AppShell } from "@/components/AppShell";
import { Kpi } from "@/components/Kpi";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell companySlug="demo" title="Dashboard" active="/c/demo/dashboard">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi title="Senaste import" value="2026-03-01" />
        <Kpi title="Rader processade" value="65 262" />
        <Kpi title="Felrader" value="0" />

        <div className="md:col-span-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium">Demo</div>
          <div className="mt-1 text-sm text-slate-600">
            Den här dashboarden är statisk demo-data. Koppla den senare till import_jobs/import_rows.
          </div>
        </div>
      </div>
    </AppShell>
  );
}