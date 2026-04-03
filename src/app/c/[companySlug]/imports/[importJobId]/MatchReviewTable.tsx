import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { importRowsForJobOrFilter } from "@/features/allocations/allocations.repo";
import ManualMatchCell from "./ManualMatchCell";

type Props = {
  companySlug: string;
  importJobId: string;
};

type CompanyRecord = {
  id: string;
  slug: string;
};

type JsonObject = Record<string, unknown>;

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
  canonical: JsonObject | null;
  normalized: JsonObject | null;
};

function getStringField(value: JsonObject | null, key: string): string | null {
  if (!value) return null;
  const raw = value[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function normalizeStatus(status: string | null): string | null {
  if (!status) return null;
  return status.trim().toLowerCase();
}

function formatAmount(value: number | null) {
  if (value == null) return "-";
  return String(value);
}

function getStatusClasses(status: string | null) {
  switch (status) {
    case "needs_review":
      return "bg-amber-100 text-amber-800";
    case "matched":
      return "bg-emerald-100 text-emerald-800";
    case "allocated":
      return "bg-blue-100 text-blue-800";
    case "invalid":
      return "bg-red-100 text-red-800";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

function getArtistFromRow(row: MatchReviewRow): string | null {
  return (
    getStringField(row.canonical, "artist") ??
    getStringField(row.normalized, "artist")
  );
}

function getIsrcFromRow(row: MatchReviewRow): string | null {
  return (
    getStringField(row.canonical, "isrc") ??
    getStringField(row.normalized, "isrc")
  );
}

function getDisplayTitle(row: MatchReviewRow): string | null {
  return (
    (row.raw_title?.trim() || null) ??
    getStringField(row.canonical, "title") ??
    getStringField(row.normalized, "title") ??
    getStringField(row.canonical, "track_title") ??
    getStringField(row.normalized, "track_title") ??
    getStringField(row.canonical, "song_title") ??
    getStringField(row.normalized, "song_title")
  );
}

function getDebugSourceLine(row: MatchReviewRow): string | null {
  const candidates = [
    getStringField(row.canonical, "title"),
    getStringField(row.normalized, "title"),
    getStringField(row.canonical, "track_title"),
    getStringField(row.normalized, "track_title"),
    getStringField(row.canonical, "song_title"),
    getStringField(row.normalized, "song_title"),
  ].filter(Boolean) as string[];

  if (candidates.length === 0) return null;

  return candidates.join(" · ");
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

  const { data: rows, error: rowsError } = await supabaseAdmin
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
    .eq("company_id", typedCompany.id)
    .or(importRowsForJobOrFilter(importJobId))
    .order("row_number", { ascending: true })
    .limit(300);

  if (rowsError) {
    throw new Error(`Failed to load match review rows: ${rowsError.message}`);
  }

  const typedRows = (rows ?? []) as MatchReviewRow[];

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b p-4">
        <div className="font-medium">Match review</div>
        <p className="mt-1 text-sm text-neutral-600">
          Review rows before allocation. Rows in needs review can be matched
          manually or used to create a new work directly.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-left">
              <th className="px-3 py-3">Row</th>
              <th className="px-3 py-3">Track info</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Work</th>
              <th className="px-3 py-3">Currency</th>
              <th className="px-3 py-3">Net</th>
              <th className="px-3 py-3">Gross</th>
            </tr>
          </thead>

          <tbody>
            {typedRows.map((row) => {
              const normalizedStatus = normalizeStatus(row.status);
              const isNeedsReview = normalizedStatus === "needs_review";
              const isMatched = normalizedStatus === "matched";

              const displayTitle = getDisplayTitle(row);
              const artist = getArtistFromRow(row);
              const isrc = getIsrcFromRow(row);
              const debugSourceLine = getDebugSourceLine(row);

              return (
                <tr
                  key={row.id}
                  className={[
                    "border-b align-top",
                    isNeedsReview ? "bg-amber-50" : "",
                    isMatched ? "bg-emerald-50/40" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-3">{row.row_number ?? "-"}</td>

                  <td className="px-3 py-3">
                    <div className="font-medium">
                      {displayTitle ?? "Unknown title"}
                    </div>

                    {artist ? (
                      <div className="text-xs text-neutral-600">{artist}</div>
                    ) : null}

                    {isrc ? (
                      <div className="mt-1 text-[11px] text-neutral-500">
                        ISRC: {isrc}
                      </div>
                    ) : null}

                    {!displayTitle && debugSourceLine ? (
                      <div className="mt-1 text-[11px] text-amber-700">
                        Source fields: {debugSourceLine}
                      </div>
                    ) : null}

                    {!displayTitle && !artist && !isrc ? (
                      <div className="mt-1 text-[11px] text-red-600">
                        No visible track metadata found on this row.
                      </div>
                    ) : null}
                  </td>

                  <td className="px-3 py-3">
                    <span
                      className={[
                        "inline-flex rounded-full px-2 py-1 text-xs font-medium",
                        getStatusClasses(normalizedStatus),
                      ].join(" ")}
                    >
                      {normalizedStatus ?? "-"}
                    </span>
                  </td>

                  <td className="px-3 py-3">
                    {isNeedsReview ? (
                      <ManualMatchCell
                        companyId={typedCompany.id}
                        companySlug={companySlug}
                        importJobId={importJobId}
                        rowId={row.id}
                        initialTitle={displayTitle}
                        initialArtist={artist}
                      />
                    ) : (
                      row.matched_work_id ?? row.work_id ?? "-"
                    )}
                  </td>

                  <td className="px-3 py-3">{row.currency ?? "-"}</td>
                  <td className="px-3 py-3">{formatAmount(row.net_amount)}</td>
                  <td className="px-3 py-3">{formatAmount(row.gross_amount)}</td>
                </tr>
              );
            })}

            {typedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-neutral-500"
                >
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