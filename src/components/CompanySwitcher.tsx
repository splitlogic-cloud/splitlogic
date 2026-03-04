"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Company = {
  id: string;
  name: string;
  slug: string;
  orgnr?: string | null;
};

export default function CompanySwitcher({
  active,
  companies,
}: {
  active: Company;
  companies: Company[];
}) {
  const [open, setOpen] = useState(false);

  const others = useMemo(
    () => companies.filter((c) => c.slug !== active.slug),
    [companies, active.slug]
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"
        title="Byt bolag"
      >
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[11px] text-slate-500">Jobbar i</span>
          <span className="font-semibold">{active.name}</span>
          {active.orgnr ? <span className="text-[11px] text-slate-500">Org.nr {active.orgnr}</span> : null}
        </div>
        <span className="text-slate-500">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-[320px] rounded-xl border bg-white shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 text-xs text-slate-500 border-b">Byt bolag</div>

          <div className="max-h-[320px] overflow-auto">
            {others.length === 0 ? (
              <div className="p-4 text-sm text-slate-600">Inga fler bolag.</div>
            ) : (
              others.map((c) => (
                <Link
                  key={c.id}
                  href={`/c/${c.slug}/statements`}
                  className="block px-4 py-3 hover:bg-slate-50"
                  onClick={() => setOpen(false)}
                >
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.orgnr ? `Org.nr ${c.orgnr}` : `slug: ${c.slug}`}</div>
                </Link>
              ))
            )}
          </div>

          <div className="border-t p-2">
            <Link
              href="/select-company"
              className="block rounded-md border px-3 py-2 text-xs font-medium text-center hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Hantera bolag
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}