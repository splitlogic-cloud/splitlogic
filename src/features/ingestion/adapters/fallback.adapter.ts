import {
  AdapterContext,
  CanonicalImportRow,
  ImportAdapter,
  NormalizedRow,
} from "../types";

function normHeader(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_");
}

function asString(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

function asNumber(v: string | undefined): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  const normalized = s.replace(/\s+/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function rowToObject(headers: string[], row: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  headers.forEach((header, idx) => {
    out[normHeader(header)] = row[idx] ?? "";
  });
  return out;
}

function pickFirst(
  raw: Record<string, unknown>,
  aliases: string[]
): string | undefined {
  for (const alias of aliases) {
    const value = raw[alias];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function toCanonical(
  ctx: AdapterContext,
  raw: Record<string, unknown>
): CanonicalImportRow {
  const amount = asNumber(
    pickFirst(raw, [
      "net_share_account_currency",
      "net_amount",
      "amount",
      "revenue",
      "earnings",
      "payout",
    ])
  );
  const currency = asString(
    pickFirst(raw, ["account_currency", "currency", "sale_currency"])
  );

  return {
    provider: "fallback",
    amount,
    currency,

    source_file_type: ctx.fileKind ?? null,
    source_name: ctx.sourceName ?? null,
    adapter_key: "fallback",

    statement_period: asString(
      pickFirst(raw, ["statement_period", "period", "month", "reporting_period"])
    ),

    title: asString(pickFirst(raw, ["title", "track", "track_title", "product"])),
    track_title: asString(
      pickFirst(raw, ["title", "track", "track_title", "product"])
    ),
    artist: asString(
      pickFirst(raw, ["artist", "track_artist", "product_artist", "main_artist"])
    ),
    release_title: asString(
      pickFirst(raw, ["release_title", "album", "release", "product_title"])
    ),

    isrc: asString(pickFirst(raw, ["isrc"])),
    upc: asString(pickFirst(raw, ["upc", "ean"])),
    territory: asString(pickFirst(raw, ["territory", "country", "sale_country"])),
    country: asString(pickFirst(raw, ["country", "territory", "sale_country"])),
    store: asString(pickFirst(raw, ["store", "service", "service_detail"])),
    service: asString(pickFirst(raw, ["store", "service", "service_detail"])),

    quantity: asNumber(pickFirst(raw, ["quantity", "qty", "units"])),
    net_amount: amount,
    account_currency: currency,
    sale_currency: asString(
      pickFirst(raw, ["sale_currency", "currency", "account_currency"])
    ),
    sale_date: asString(
      pickFirst(raw, ["sale_date", "transaction_date", "date"])
    ),
    transaction_date: asString(
      pickFirst(raw, ["sale_date", "transaction_date", "date"])
    ),

    raw,
  };
}

export const fallbackAdapter: ImportAdapter = {
  key: "fallback",
  displayName: "Fallback adapter",

  canHandle(_ctx) {
    return 0.01;
  },

  normalize(ctx): NormalizedRow[] {
    const normalizedHeaders = ctx.headers.map(normHeader);
    const bodyRows = ctx.rows.slice(ctx.headerRowIndex + 1);

    return bodyRows
      .filter((row) => row.some((cell) => (cell ?? "").trim() !== ""))
      .map((row) => {
        const raw = rowToObject(normalizedHeaders, row);
        return {
          raw,
          canonical: toCanonical(ctx, raw),
          warnings: ["heuristic_mapping_used"],
        };
      });
  },
};