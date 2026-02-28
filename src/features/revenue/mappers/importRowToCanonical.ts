import { CanonicalRevenueRowInsert } from "@/features/revenue/revenue.repo";

/**
 * Converts an import_rows.normalized (preferred) into a canonical revenue row.
 *
 * IMPORTANT:
 * - This expects normalized to contain revenue fields.
 * - If your current normalized only has isrc/upc/store (as in your screenshot),
 *   then this particular import is NOT a revenue statement import yet.
 *   It may be a catalog/work import. Revenue imports must normalize fields like:
 *   date, amount, currency, territory, quantity.
 */
export function mapImportRowToCanonicalRevenue(args: {
  companyId: string;
  importId: string;
  importRowId: string;
  rowNumber: number;
  sourceSystem: string; // e.g. "spotify", "distrokid"
  normalized: Record<string, any> | null;
  raw: Record<string, any> | null;
}): CanonicalRevenueRowInsert {
  const n = args.normalized ?? {};
  const r = args.raw ?? {};

  // --- REQUIRED FIELDS for revenue_rows ---
  const eventDate =
    asDate(n.event_date ?? n.date ?? n.transaction_date ?? r["Event Date"] ?? r["Date"]) ??
    null;
  if (!eventDate) throw new Error(`Missing event_date on import_row ${args.importRowId}`);

  const currency = asString(n.currency ?? n.currency_code ?? r["Currency"] ?? r["Currency Code"]);
  if (!currency) throw new Error(`Missing currency on import_row ${args.importRowId}`);

  const amountNet =
    asNumber(n.amount_net ?? n.net_amount ?? n.net_revenue ?? r["Net Revenue"] ?? r["Amount"]) ??
    null;
  if (amountNet === null) throw new Error(`Missing amount_net on import_row ${args.importRowId}`);

  // --- OPTIONAL FIELDS ---
  const territory = asString(n.territory ?? n.country ?? r["Territory"] ?? r["Country"]) ?? null;
  const quantity = asNumber(n.quantity ?? n.units ?? n.streams ?? r["Quantity"] ?? r["Units"]) ?? null;

  const amountGross =
    asNumber(n.amount_gross ?? n.gross_amount ?? n.gross_revenue ?? r["Gross Revenue"]) ?? null;

  const workRef =
    asString(n.work_ref ?? n.track_name ?? n.title ?? r["Track Name"] ?? r["Title"]) ?? null;

  const externalTrackId =
    asString(n.isrc ?? n.track_isrc ?? r["ISRC"] ?? r["Track ISRC"]) ?? null;

  const sourceFileId =
    asString(n.source_file_id ?? n.report_id ?? n.statement_id ?? r["Report ID"] ?? r["Statement ID"]) ??
    null;

  return {
    company_id: args.companyId,
    import_job_id: args.importId,
    import_row_id: args.importRowId,

    source_system: args.sourceSystem,
    source_file_id: sourceFileId,
    source_row_number: args.rowNumber,

    event_date: eventDate,
    territory: territory ? territory.toUpperCase() : null,
    currency: currency.toUpperCase(),
    quantity,

    amount_gross: amountGross,
    amount_net: amountNet,

    work_id: null, // match later (ISRC/title)
    work_ref: workRef,
    external_track_id: externalTrackId,

    // keep raw + normalized for audit/debug
    raw_row_json: { raw: r, normalized: n },
  };
}

// ---------- helpers ----------
function asString(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
}

function asDate(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}