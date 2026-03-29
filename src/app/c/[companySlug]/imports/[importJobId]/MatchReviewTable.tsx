import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ManualMatchCell from "./ManualMatchCell";

type Props = { companySlug: string; importJobId: string };

type MatchReviewRow = {
  id: string;
  row_number: number | null;
  status: string | null;
  matched_work_id: string | null;
  work_id: string | null;
  currency: string | null;
  net_amount: number | null;
  gross_amount: number | null;
  raw_title: string | null;
  canonical: Record<string, unknown> | null;
  normalized: Record<string, unknown> | null;
};

export default async function MatchReviewTable({ companySlug, importJobId }: Props) {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (!company) throw new Error("Company not found");

  const { data: rows } = await supabaseAdmin
    .from("import_rows")
    .select(`
      id,row_number,status,matched_work_id,work_id,currency,
      net_amount,gross_amount,raw_title,canonical,normalized
    `)
    .eq("import_job_id", importJobId)
    .order("row_number", { ascending: true });

  const typedRows = (rows ?? []) as MatchReviewRow[];

  const getArtist = (row: MatchReviewRow) => {
    const a = typeof row.canonical?.artist === "string" ? row.canonical.artist : row.normalized?.artist;
    return a?.trim() || null;
  };

  const fmtAmount = (v: number | null) => (v == null ? "-" : v);

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b p-4">
        <div className="font-medium">Match review</div>
        <p className="mt-1 text-sm text-neutral-600">
          Rows in needs review can be matched manually or used to create a new work.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-left">
              <th className="px-3 py-3">Row</th>
              <th className="px-3 py-3">Title</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Work</th>
              <th className="px-3 py-3">Currency</th>
              <th className="px-3 py-3">Net</th>
              <th className="px-3 py-3">Gross</th>
            </tr>
          </thead>
          <tbody>
            {typedRows.map((row) => {
              const isNeedsReview = row.status === "needs_review";
              const isMatched = row.status === "matched";
              const artist = getArtist(row);
              const title = row.raw_title ?? "-";

              return (
                <tr
                  key={row.id}
                  className={`border-b align-top ${
                    isNeedsReview ? "bg-amber-50" : ""
                  } ${isMatched ? "bg-emerald-50/40" : ""}`}
                >
                  <td className="px-3 py-3">{row.row_number ?? "-"}</td>
                  <td className="px-3 py-3">
                    {title}
                    {artist && <div className="text-xs text-neutral-500">{artist}</div>}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        isNeedsReview
                          ? "bg-amber-100 text-amber-800"
                          : isMatched
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {row.status ?? "-"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {isNeedsReview ? (
                      <ManualMatchCell
                        companyId={company.id}
                        companySlug={companySlug}
                        importJobId={importJobId}
                        rowId={row.id}
                        initialTitle={row.raw_title}
                        initialArtist={artist}
                      />
                    ) : (
                      row.matched_work_id ?? row.work_id ?? "-"
                    )}
                  </td>
                  <td className="px-3 py-3">{row.currency ?? "-"}</td>
                  <td className="px-3 py-3">{fmtAmount(row.net_amount)}</td>
                  <td className="px-3 py-3">{fmtAmount(row.gross_amount)}</td>
                </tr>
              );
            })}
            {typedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                  No import rows found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}