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
  const netAmount = asNumber(
    pickFirst(raw, [
      "net_amount",
      "net_revenue",
      "earnings",
      "amount",
      "net_share_account_currency",
    ])
  );
  const currency = asString(
    pickFirst(raw, ["currency", "account_currency", "sale_currency"])
  );

  return {
    provider: "generic",
    amount: netAmount,
    currency,

    source_file_type: ctx.fileKind ?? null,
    source_name: ctx.sourceName ?? null,
    adapter_key: "generic",

    statement_period: asString(
      pickFirst(raw, ["statement_period", "period", "month", "reporting_period"])
    ),

    title: asString(
      pickFirst(raw, ["title", "track", "track_title", "song_title", "product"])
    ),
    track_title: asString(
      pickFirst(raw, ["title", "track", "track_title", "song_title", "product"])
    ),
    artist: asString(
      pickFirst(raw, ["artist", "track_artist", "main_artist", "product_artist"])
    ),
    release_title: asString(
      pickFirst(raw, ["release_title", "album", "release", "product_title"])
    ),

    isrc: asString(pickFirst(raw, ["isrc"])),
    upc: asString(pickFirst(raw, ["upc", "ean"])),
    territory: asString(pickFirst(raw, ["territory", "country", "sale_country"])),
    country: asString(pickFirst(raw, ["country", "territory", "sale_country"])),
    store: asString(pickFirst(raw, ["store", "service", "platform"])),
    service: asString(pickFirst(raw, ["store", "service", "platform"])),

    quantity: asNumber(pickFirst(raw, ["quantity", "units", "streams"])),
    net_amount: netAmount,
    gross_amount: asNumber(
      pickFirst(raw, [
        "gross_amount",
        "gross_revenue",
        "gross_sale_amount",
        "gross",
      ])
    ),
    account_currency: currency,
    sale_currency: asString(
      pickFirst(raw, ["sale_currency", "currency", "account_currency"])
    ),
    sale_date: asString(
      pickFirst(raw, ["sale_date", "transaction_date", "date", "period_start"])
    ),
    transaction_date: asString(
      pickFirst(raw, ["sale_date", "transaction_date", "date", "period_start"])
    ),

    raw,
  };
}

export const genericAdapter: ImportAdapter = {
  key: "generic",
  displayName: "Generic delimited adapter",

  canHandle(ctx) {
    const joined = ctx.headers.join(" ").toLowerCase();
    let score = 0;

    if (joined.includes("title") || joined.includes("track")) score += 0.2;
    if (joined.includes("artist")) score += 0.2;
    if (joined.includes("amount") || joined.includes("revenue")) score += 0.2;
    if (joined.includes("currency")) score += 0.1;
    if (joined.includes("isrc")) score += 0.2;

    return Math.min(score, 0.8);
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
        };
      });
  },
};