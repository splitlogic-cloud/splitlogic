import { createClient } from "@/lib/supabase/server";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

type Params = { companySlug: string };

export default async function Page({
  params,
}: {
  params: Promise<Params> | Params;
}) {
  const { companySlug } = await Promise.resolve(params);

  const supabase = await createClient();
  const company = await requireCompanyBySlugForUser(companySlug);

  const { data: latestJob } = await supabase
    .from("import_jobs")
    .select("id, created_at, processed_rows, warning_count, status")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestDate = latestJob?.created_at
    ? new Date(latestJob.created_at).toLocaleDateString("sv-SE")
    : "—";

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="text-sm text-slate-500">
          Active company:{" "}
          <span className="font-medium text-slate-800">{companySlug}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi title="Senaste import" value={latestDate} />
        <Kpi
          title="Rader processade"
          value={latestJob?.processed_rows?.toLocaleString("sv-SE") ?? "—"}
        />
        <Kpi title="Warnings" value={String(latestJob?.warning_count ?? "—")} />
      </div>

      {latestJob?.status && (
        <div className="mt-6 text-sm text-slate-500">
          Status: <span className="font-medium text-slate-800">{latestJob.status}</span>
        </div>
      )}
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-3xl font-semibold mt-2 tracking-tight">{value}</div>
    </div>
  );
}