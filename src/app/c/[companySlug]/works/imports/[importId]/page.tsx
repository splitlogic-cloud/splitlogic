import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

export default async function WorkImportPage({
  params,
}: {
  params: Promise<{ companySlug: string; importId: string }>;
}) {
  const { companySlug, importId } = await params;

  if (!isUuid(importId)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id,name,slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (!company) {
    notFound();
  }

  const { data: job } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", importId)
    .maybeSingle();

  if (!job) {
    notFound();
  }

  const { count } = await supabase
    .from("import_rows")
    .select("*", { count: "exact", head: true })
    .eq("import_id", importId);

  const reviewLimit = 200;

  const { data: rows } = await supabase
    .from("import_rows")
    .select("id,row_number,raw")
    .eq("import_id", importId)
    .order("row_number")
    .limit(reviewLimit);

  const parsedRows =
    rows?.map((row) => ({
      ...row,
      rawPreview: JSON.stringify(row.raw),
    })) ?? [];

  return (
    <div className="space-y-6">

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Work import review</h1>
          <p className="text-sm text-slate-500">
            Import preview for {company.name}
          </p>
        </div>

        <Link
          href={`/c/${companySlug}/works`}
          className="rounded-xl border px-4 py-2 text-sm"
        >
          Back to works
        </Link>
      </div>

      <div className="rounded-3xl border bg-white p-6">

        <div className="grid grid-cols-4 gap-6">

          <div>
            <div className="text-sm text-slate-500">Import ID</div>
            <div className="font-medium">{job.id}</div>
          </div>

          <div>
            <div className="text-sm text-slate-500">File</div>
            <div className="font-medium">{job.file_name ?? "—"}</div>
          </div>

          <div>
            <div className="text-sm text-slate-500">Rows shown</div>
            <div className="font-medium">
              {parsedRows.length.toLocaleString()}
            </div>
          </div>

          <div>
            <div className="text-sm text-slate-500">Total rows</div>
            <div className="font-medium">
              {(count ?? 0).toLocaleString()}
            </div>
          </div>

        </div>
      </div>

      <div className="rounded-3xl border bg-white">

        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            Parsed row review
          </h2>

          <p className="text-sm text-slate-500 mt-1">
            Showing {parsedRows.length.toLocaleString()} of{" "}
            {(count ?? 0).toLocaleString()} rows
          </p>
        </div>

        {!parsedRows.length ? (
          <div className="px-6 py-8 text-sm text-slate-500">
            No rows found
          </div>
        ) : (
          <div className="overflow-x-auto">

            <div className="min-w-[900px]">

              <div className="grid grid-cols-[100px_1fr] gap-4 border-b px-6 py-4 text-xs uppercase text-slate-500">

                <div>Row</div>
                <div>Raw preview</div>

              </div>

              {parsedRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[100px_1fr] gap-4 border-b px-6 py-4"
                >

                  <div>{row.row_number}</div>

                  <div className="truncate text-sm text-slate-600">
                    {row.rawPreview}
                  </div>

                </div>
              ))}

            </div>

          </div>
        )}
      </div>
    </div>
  );
}