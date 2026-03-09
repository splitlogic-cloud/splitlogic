import "server-only";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ImportsPage({
  params,
}: {
  params: { companySlug: string };
}) {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("import_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Imports</h1>

        <Link
          href={`/c/${params.companySlug}/imports/upload`}
          className="rounded bg-blue-600 text-white px-4 py-2"
        >
          Upload file
        </Link>
      </div>

      <div className="bg-white rounded border">
        {jobs?.map((job) => (
          <div
            key={job.id}
            className="p-4 border-b flex justify-between"
          >
            <div>{job.file_name}</div>
            <div className="text-sm text-gray-500">
              {job.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}