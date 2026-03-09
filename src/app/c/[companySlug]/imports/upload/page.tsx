import "server-only";

export const dynamic = "force-dynamic";

export default async function UploadImportPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Upload import</h1>
        <p className="text-sm text-slate-500">
          Upload CSV for company: {companySlug}
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          Upload page is connected correctly.
        </p>
      </div>
    </div>
  );
}