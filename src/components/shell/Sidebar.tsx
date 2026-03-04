// src/components/shell/Sidebar.tsx
import Link from "next/link";
import NavItem from "./SidebarNavItem";
import CompanyDropdown from "./company/CompanyDropdown";

type Company = {
  id: string;
  name: string;
  slug: string;
  orgnr?: string | null;
  role?: string | null;
};

export default function Sidebar({
  activeCompany,
  companies,
}: {
  activeCompany: Company;
  companies: Company[];
}) {
  const slug = activeCompany.slug;

  return (
    <aside className="bg-[#081824] text-white border-r border-white/5">
      <div className="h-full flex flex-col">
        {/* Brand */}
        <div className="px-5 pt-5">
          <Link href={`/c/${slug}/dashboard`} className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#00C2FF]/15 border border-[#00C2FF]/25 flex items-center justify-center">
              <span className="text-[#00C2FF] text-lg font-bold">∿</span>
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight">SplitLogic</div>
              <div className="text-[11px] text-white/50 -mt-0.5">ROYALTY ENGINE</div>
            </div>
          </Link>
        </div>

        {/* Active company dropdown */}
        <div className="px-5 pt-5">
          <CompanyDropdown activeCompany={activeCompany} companies={companies} />
        </div>

        {/* Nav */}
        <div className="px-4 pt-6">
          <div className="px-2 pb-2 text-[11px] uppercase tracking-wider text-white/35">
            Navigation
          </div>

          <nav className="space-y-1">
            <NavItem href={`/c/${slug}/dashboard`} label="Dashboard" icon="grid" />
            <NavItem href={`/c/${slug}/imports`} label="Imports" icon="download" />
            <NavItem href={`/c/${slug}/works`} label="Works" icon="wave" />
            <NavItem href={`/c/${slug}/parties`} label="Parties" icon="users" />
            <NavItem href={`/c/${slug}/statements`} label="Statements" icon="file" badge="6" />
            <NavItem href={`/c/${slug}/audit`} label="Audit" icon="shield" />
          </nav>
        </div>

        <div className="mt-auto px-5 py-5 text-xs text-white/35">
          <div className="flex items-center justify-between">
            <span className="truncate">{activeCompany.name}</span>
            <span className="text-white/25">v1.1</span>
          </div>
        </div>
      </div>
    </aside>
  );
}