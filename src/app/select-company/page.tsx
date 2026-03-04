// src/app/select-company/page.tsx
import Link from "next/link";
import { listMyCompanies } from "@/features/companies/companies.repo";
import CreateCompanyClient from "./ui/CreateCompanyClient";

export const dynamic = "force-dynamic";

export default async function SelectCompanyPage() {
  const companies = await listMyCompanies();

  return (
    <div className="min-h-[calc(100vh-0px)] p-6 bg-slate-50">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Välj bolag</h1>
              <p className="text-sm text-slate-600">
                Du är inloggad. Välj vilket bolag du vill arbeta i. Du kan byta bolag när som helst.
              </p>
            </div>

            <CreateCompanyClient />
          </div>
        </div>

        <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <div className="text-sm font-medium">Dina bolag</div>
            <div className="text-xs text-slate-500">{companies.length} st</div>
          </div>

          {companies.length === 0 ? (
            <div className="p-8 text-sm text-slate-600">
              Du har inga bolag ännu. Skapa ett nytt bolag uppe till höger.
            </div>
          ) : (
            <div className="divide-y">
              {companies.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-4 p-5 hover:bg-slate-50">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.orgnr ? `Org.nr ${c.orgnr} • ` : ""}
                      slug: {c.slug} • role: {c.role ?? "member"}
                    </div>
                  </div>
                  <Link
                    href={`/c/${c.slug}/statements`}
                    className="inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-xs font-medium text-white"
                  >
                    Öppna
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs text-slate-500">
          Tips: När du står i ett bolag syns bolagsnamnet alltid i topbaren. Byt bolag där.
        </div>
      </div>
    </div>
  );
}