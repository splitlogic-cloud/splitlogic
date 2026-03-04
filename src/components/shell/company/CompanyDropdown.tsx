// src/components/shell/company/CompanyDropdown.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Company = {
  id: string;
  name: string;
  slug: string;
  orgnr?: string | null;
  role?: string | null;
};

function initials(name: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "C";
  const a = parts[0]?.[0] ?? "C";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase();
}

export default function CompanyDropdown({
  activeCompany,
  companies,
}: {
  activeCompany: Company;
  companies: Company[];
}) {
  const [open, setOpen] = useState(false);

  const others = useMemo(
    () => companies.filter((c) => c.slug !== activeCompany.slug),
    [companies, activeCompany.slug]
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-2xl bg-white/5 border border-white/10 px-3 py-3 hover:bg-white/7 transition"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#00C2FF]/15 border border-[#00C2FF]/25 flex items-center justify-center">
            <span className="text-[#00C2FF] text-sm font-semibold">{initials(activeCompany.name)}</span>
          </div>

          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-semibold text-white">{activeCompany.name}</div>
            <div className="text-[11px] text-white/45">Active company</div>
          </div>

          <div className="text-white/40">▾</div>
        </div>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-white/10 bg-[#06131C] shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/35 border-b border-white/10">
            Switch company
          </div>

          <div className="max-h-[320px] overflow-auto">
            {others.length === 0 ? (
              <div className="p-4 text-sm text-white/60">No other companies</div>
            ) : (
              others.map((c) => (
                <Link
                  key={c.id}
                  href={`/c/${c.slug}/dashboard`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 hover:bg-white/5 transition"
                >
                  <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <span className="text-xs text-white/70 font-semibold">{initials(c.name)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white/90 font-medium">{c.name}</div>
                    <div className="text-[11px] text-white/40">
                      {c.orgnr ? `Org.nr ${c.orgnr}` : `slug: ${c.slug}`}
                    </div>
                  </div>
                  <span className="text-white/25">→</span>
                </Link>
              ))
            )}
          </div>

          <div className="border-t border-white/10 p-2">
            <Link
              href="/select-company"
              onClick={() => setOpen(false)}
              className="block rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-medium text-white/80 text-center"
            >
              Manage companies
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}