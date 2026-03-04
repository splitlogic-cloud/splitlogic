// src/components/shell/AppShell.tsx
import { ReactNode } from "react";
import Sidebar from "./Sidebar";

type Company = {
  id: string;
  name: string;
  slug: string;
  orgnr?: string | null;
  role?: string | null;
};

export default function AppShell({
  children,
  activeCompany,
  companies,
}: {
  children: ReactNode;
  activeCompany: Company;
  companies: Company[];
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="grid min-h-screen grid-cols-[280px_1fr]">
        <Sidebar activeCompany={activeCompany} companies={companies} />
        <main className="min-w-0">
          <div className="px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}