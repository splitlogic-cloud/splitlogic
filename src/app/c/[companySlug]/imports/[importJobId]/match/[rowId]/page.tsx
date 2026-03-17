import "server-only";

import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { manualMatchWork } from "@/features/imports/actions/manualMatchWork";

export const dynamic = "force-dynamic";

export default async function MatchRowPage({
  params,
}: {
  params: {
    companySlug: string;
    importJobId: string;
    rowId: string;
  };
}) {
  const { companySlug, importJobId, rowId } = params;

  const { data: row } = await supabaseAdmin
    .from("import_rows")
    .select("id, raw, matched_work_id")
    .eq("id", rowId)
    .maybeSingle();

  if (!row) {
    notFound();
  }

  const raw = (row.raw ?? {}) as Record<string, unknown>;

  const title =
    String(raw.title ?? raw.track ?? raw.track_title ?? "");

  const artist =
    String(raw.artist ?? raw.track_artist ?? raw.product_artist ?? "");

  const { data: works } = await supabaseAdmin
    .from("works")
    .select("id,title,isrc")
    .ilike("title", `%${title}%`)
    .limit(20);

  return (
    <div className="space-y-6">

      <h1 className="text-2xl font-semibold">Manual match</h1>

      <div className="rounded-xl border p-4 bg-white">
        <div className="text-sm text-gray-500">Import row</div>

        <div className="mt-2">
          <div><b>Title:</b> {title}</div>
          <div><b>Artist:</b> {artist}</div>
          <div><b>ISRC:</b> {String(raw.isrc ?? "")}</div>
        </div>
      </div>

      <div className="rounded-xl border p-4 bg-white">

        <h2 className="font-medium mb-4">Possible works</h2>

        <div className="space-y-3">

          {works?.map((work) => (
            <form
              key={work.id}
              action={async () => {
                "use server";

                await manualMatchWork({
                  importRowId: row.id,
                  workId: work.id,
                  companySlug,
                  importJobId,
                });
              }}
            >
              <button
                type="submit"
                className="w-full border rounded-lg p-3 text-left hover:bg-gray-50"
              >
                <div className="font-medium">
                  {work.title}
                </div>

                <div className="text-sm text-gray-500">
                  ISRC: {work.isrc}
                </div>
              </button>
            </form>
          ))}

        </div>

      </div>

    </div>
  );
}