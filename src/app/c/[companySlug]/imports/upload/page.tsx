import "server-only";
import { requireActiveCompany } from "@/lib/active-company";
import UploadImportsClient from "../UploadImportsClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

export default async function UploadImportPage({ params }: PageProps) {
  const { companySlug } = await params;

  await requireActiveCompany(companySlug);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Upload CSV</h1>
        <p className="text-sm text-slate-500">
          Import source file for company: {companySlug}
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <UploadImportsClient companySlug={companySlug} />
      </div>
    </div>
  );
}