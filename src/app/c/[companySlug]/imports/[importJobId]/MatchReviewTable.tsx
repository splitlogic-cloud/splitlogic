import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import ManualMatchCell from "./ManualMatchCell";

type Props = {
  companySlug: string;
  importJobId: string;
};

type CompanyRecord = {
  id: string;
  slug: string;
};

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

function getArtistFromRow(row: MatchReviewRow): string | null {
  const canonicalArtist =
    typeof row.canonical?.artist === "string" ? row.canonical.artist : null;

  if (canonicalArtist?.trim()) return canonicalArtist.trim();

  const normalizedArtist =
    typeof row.normalized?.artist === "string" ? row.normalized.artist : null;

  if (normalizedArtist?.trim()) return normalizedArtist.trim();

  return null;
}

export default async function MatchReviewTable({
  companySlug,
  importJobId,
}: Props) {
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }

  if (!company) {
    throw new Error("Company not found");
  }

  const typedCompany = company as CompanyRecord;

  const { data: rows, error } = await supabaseAdmin
    .from("import_rows")
    .select(`
      id,
      row_number,
      status,
      matched_work_id,
      work_id,
      currency,
      net_amount,
      gross_amount,
      raw_title,
      canonical,
      normalized
    `)
    .eq("import_job_id", importJobId)
    .order("row_number", { ascending: true })
    .limit(300);

  if (error) {
    throw new Error(`Failed to load match review rows: ${error.message}`);
  }

  const typedRows = (rows ?? []) as MatchReviewRow[];

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b p-4">
        <div className="font-medium">Match review</div>
        <p className="mt-1 text-sm text-neutral-600">
          Review matched / unmatched rows before allocation.
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
              const title = row.raw_title ?? "-";
              const artist = getArtistFromRow(row);

              return (
                <tr key={row.id} className="border-b align-top">
                  <td className="px-3 py-3">{row.row_number ?? "-"}</td>
                  <td className="px-3 py-3">
                    <div>{title}</div>
                    {artist ? (
                      <div className="text-xs text-neutral-500">{artist}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{row.status ?? "-"}</td>
                  <td className="px-3 py-3">
                    {row.status === "needs_review" ? (
                      <ManualMatchCell
                        companyId={typedCompany.id}
                        companySlug={companySlug}
                        importJobId={importJobId}
                        rowId={row.id}
                        initialTitle={row.raw_title}
                        initialArtist={artist}
                      />
                    ) : row.matched_work_id ?? row.work_id ?? "-"}
                  </td>
                  <td className="px-3 py-3">{row.currency ?? "-"}</td>
                  <td className="px-3 py-3">
                    {row.net_amount != null ? row.net_amount : "-"}
                  </td>
                  <td className="px-3 py-3">
                    {row.gross_amount != null ? row.gross_amount : "-"}
                  </td>
                </tr>
              );
            })}

            {typedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                  No import rows found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}