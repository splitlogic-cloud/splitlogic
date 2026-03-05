import "server-only";

import { AppShell } from "@/components/AppShell";
import { Kpi } from "@/components/Kpi";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell companySlug="demo" title="Dashboard" active="/ui/demo">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi title="Senaste import" value="2026-03-01" />
        <Kpi title="Rader processade" value="65 262" />
        <Kpi title="Felrader" value="0" />
      </div>
    </AppShell>
  );
}