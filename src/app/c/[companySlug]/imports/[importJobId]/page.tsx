import ImportRowClient from "./row.client";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";

type Params = { companySlug: string; importJobId: string };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { companySlug, importJobId } = await params;

  // ✅ detta finns enligt ditt felmeddelande
  const company = await requireCompanyBySlugForUser(companySlug);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Import</h1>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Company: <b>{company.slug}</b> · Import ID: <b>{importJobId}</b>
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 16,
          padding: 16,
          background: "white",
        }}
      >
        <ImportRowClient companyId={company.id} importJobId={importJobId} />
      </div>
    </div>
  );
}