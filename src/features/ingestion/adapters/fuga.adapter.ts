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
    pickFirst(raw, ["net_amount", "income", "earnings", "net_revenue"])
  );
  const currency = asString(pickFirst(raw, ["currency"]));

  return {
    provider: "fuga",
    amount: netAmount,
    currency,

    source_file_type: ctx.fileKind ?? null,
    source_name: "FUGA",
    adapter_key: "fuga",

    statement_period: asString(
      pickFirst(raw, ["statement_period", "reporting_period", "period"])
    ),

    title: asString(pickFirst(raw, ["track_title", "title", "resource_title"])),
    track_title: asString(
      pickFirst(raw, ["track_title", "title", "resource_title"])
    ),
    artist: asString(
      pickFirst(raw, ["display_artist", "artist", "main_artist"])
    ),
    release_title: asString(
      pickFirst(raw, ["release_title", "release", "album"])
    ),

    isrc: asString(pickFirst(raw, ["isrc"])),
    upc: asString(pickFirst(raw, ["upc"])),
    territory: asString(pickFirst(raw, ["territory", "country"])),
    country: asString(pickFirst(raw, ["country", "territory"])),
    store: asString(pickFirst(raw, ["service", "store", "platform"])),
    service: asString(pickFirst(raw, ["service", "store", "platform"])),

    quantity: asNumber(
      pickFirst(raw, ["quantity", "units", "usage_quantity"])
    ),
    net_amount: netAmount,
    gross_amount: asNumber(pickFirst(raw, ["gross_amount", "gross_revenue"])),
    account_currency: currency,
    sale_date: asString(pickFirst(raw, ["sale_date", "date"])),
    transaction_date: asString(pickFirst(raw, ["sale_date", "date"])),

    raw,
  };
}

export const fugaAdapter: ImportAdapter = {
  key: "fuga",
  displayName: "FUGA adapter",

  canHandle(ctx) {
    const joined = ctx.headers.join(" ").toLowerCase();

    let score = 0;
    if (joined.includes("resource title")) score += 0.2;
    if (joined.includes("display artist")) score += 0.2;
    if (joined.includes("service")) score += 0.2;
    if (joined.includes("usage quantity")) score += 0.2;
    if (joined.includes("isrc")) score += 0.2;

    return Math.min(score, 1);
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