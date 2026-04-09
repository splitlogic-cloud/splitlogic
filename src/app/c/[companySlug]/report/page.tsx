import "server-only";

import Link from "next/link";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

export default async function ReportPage({ params }: PageProps) {
  const { companySlug } = await params;

  const reportLinks = [
    {
      title: "Work split coverage",
      description: "Coverage, completeness and blockers for work split setup.",
      href: `/c/${companySlug}/works/coverage`,
      cta: "Open coverage report",
    },
    {
      title: "Statements",
      description: "Generated statement status, QA and exports.",
      href: `/c/${companySlug}/statements`,
      cta: "Open statements",
    },
    {
      title: "Allocations",
      description: "Allocation runs and blocker diagnostics per run.",
      href: `/c/${companySlug}/allocations`,
      cta: "Open allocations",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-slate-500">Report</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Reports
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Samlad vy över rapporter för coverage, statements och allocations.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reportLinks.map((item) => (
          <div
            key={item.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-slate-950">{item.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            <div className="mt-4">
              <Link
                href={item.href}
                className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {item.cta}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
