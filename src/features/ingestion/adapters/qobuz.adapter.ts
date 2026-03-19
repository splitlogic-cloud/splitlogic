import {
  AdapterContext,
  CanonicalImportRow,
  ImportAdapter,
  NormalizedRow,
} from "../types";

function normHeader(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_");
}

function str(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
}

function num(v: unknown): number | null {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function rowToObject(headers: string[], row: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    out[h] = row[i] ?? "";
  });
  return out;
}

function toCanonical(
  ctx: AdapterContext,
  raw: Record<string, unknown>
): CanonicalImportRow {
  const amount =
    num(raw["net_share_account_currency"]) ??
    num(raw["gross_revenue_account_currency"]);

  const currency = str(raw["account_currency"]);

  return {
    provider: "qobuz",
    amount,
    currency,

    source_name: "Qobuz",
    source_file_type: ctx.fileKind ?? null,
    adapter_key: "qobuz",

    store: str(raw["store"]),
    service: str(raw["store"]),

    transaction_date: str(raw["transaction_date"]),
    sale_date: str(raw["transaction_date"]),
    statement_period: str(raw["statement_period"]),

    territory: str(raw["sale_country"]),
    country: str(raw["sale_country"]),

    quantity: num(raw["quantity"]),

    net_amount: amount,
    gross_amount: num(raw["gross_revenue_account_currency"]),

    sale_currency: str(raw["sale_currency"]),
    account_currency: currency,

    isrc: str(raw["isrc"]),
    upc: str(raw["display_upc"]),

    track_title: str(raw["track"]),
    title: str(raw["track"]),
    release_title: str(raw["product"]),
    artist:
      str(raw["track_artist"]) ??
      str(raw["product_artist"]),

    label: str(raw["label_imprint"]),

    raw,
  };
}

export const qobuzAdapter: ImportAdapter = {
  key: "qobuz",
  displayName: "Qobuz adapter",

  canHandle(ctx) {
    const headers = ctx.headers.map((h) => h.toUpperCase());

    const must = [
      "STORE",
      "ACCOUNT CURRENCY",
      "NET SHARE ACCOUNT CURRENCY",
      "GROSS REVENUE ACCOUNT CURRENCY",
      "TRANSACTION DATE",
      "STATEMENT PERIOD",
    ];

    const hits = must.filter((k) => headers.includes(k)).length;
    return hits / must.length;
  },

  normalize(ctx): NormalizedRow[] {
    const headers = ctx.headers.map(normHeader);
    const bodyRows = ctx.rows.slice(ctx.headerRowIndex + 1);

    return bodyRows
      .filter((row) => row.some((cell) => (cell ?? "").trim() !== ""))
      .map((row) => {
        const raw = rowToObject(headers, row);

        return {
          raw,
          canonical: toCanonical(ctx, raw),
        };
      });
  },
};