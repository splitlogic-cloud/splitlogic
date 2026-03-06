import "server-only";
import UploadMasterdataClient from "../UploadMasterdataClient";

export const dynamic = "force-dynamic";

export default async function UploadMasterdataPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload masterdata</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a masterdata file and create a new import job.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <UploadMasterdataClient companySlug={companySlug} />
      </div>
    </div>
  );
}