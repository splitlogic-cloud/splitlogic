// src/app/c/[companySlug]/layout.tsx
import { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import { listMyCompanies, requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

export const dynamic = "force-dynamic";

export default async function CompanyLayout(props: {
  children: ReactNode;
  params: Promise<{ companySlug: string }> | { companySlug: string };
}) {
  const params = await Promise.resolve(props.params);
  const companySlug = params.companySlug;

  const active = await requireCompanyBySlugForUser(companySlug);
  const companies = await listMyCompanies();

  return (
    <AppShell
      activeCompany={{
        id: active.id,
        name: active.name,
        slug: active.slug,
        role: active.role ?? null,
      }}
      companies={companies.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        role: c.role ?? null,
      }))}
    >
      {props.children}
    </AppShell>
  );
}