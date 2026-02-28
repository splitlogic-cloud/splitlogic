import "server-only";
import Link from "next/link";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

type AnyParams = Record<string, string | string[] | undefined>;
type Props = { params: AnyParams | Promise<AnyParams> };

function pickSlug(params: AnyParams) {
  const v = params.companySlug ?? params.slug ?? params.company;
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardPage(props: Props) {
  const params = (await props.params) as AnyParams;
  const companySlug = pickSlug(params);
  if (!companySlug) throw new Error("Missing companySlug");

  const company = await requireCompanyBySlugForUser(companySlug);

  const cards = [
    { title: "Masterdata", desc: "Upload → Preview → Apply", href: `/c/${companySlug}/masterdata` },
    { title: "Imports", desc: "Se alla importer", href: `/c/${companySlug}/imports` },
    { title: "Works", desc: "Lista works", href: `/c/${companySlug}/works` },
    { title: "Allocations", desc: "Förklaringsvy för beräkningar", href: `/c/${companySlug}/allocations` },
  ];

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">SplitLogic</h1>
        <p className="text-sm text-slate-600">
          Company: <span className="font-medium text-slate-900">{company.name}</span>
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"
          >
            <div className="text-lg font-semibold">{c.title}</div>
            <div className="text-sm text-slate-600 mt-1">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}