import "server-only";
import { requireActiveCompany } from "@/lib/active-company";

export const dynamic = "force-dynamic";

type PageProps = {
  params: {
    companySlug: string;
  };
};

export default async function UploadImportPage({ params }: PageProps) {
  const { companySlug } = params;

  // säkerställ att user har access till bolaget
  await requireActiveCompany(companySlug);

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Upload CSV
        </h1>

        <p className="text-sm text-slate-500">
          Company: {companySlug}
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

        <form
          action={`/api/imports/upload`}
          method="POST"
          encType="multipart/form-data"
          className="space-y-4"
        >
          <input
            type="file"
            name="file"
            accept=".csv"
            className="block w-full text-sm"
            required
          />

          <button
            type="submit"
            className="rounded-xl bg-black text-white px-4 py-2 text-sm"
          >
            Upload CSV
          </button>
        </form>

      </div>

    </div>
  );
}