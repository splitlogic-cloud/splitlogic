import type {
  ImportAdapter,
  NormalizeResult,
  NormalizedRow,
} from "../types";

function normHeader(header: string): string {
  return String(header ?? "").trim().toLowerCase();
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function num(value: unknown): number | null {
  const s = str(value);
  if (!s) return null;

  const normalized = s.replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirst(
  headers: string[],
  predicate: (normalizedHeader: string) => boolean
): string | null {
  for (const header of headers) {
    if (predicate(normHeader(header))) {
      return header;
    }
  }
  return null;
}

function looksLikeCurrency(value: unknown): boolean {
  const s = str(value).toUpperCase();
  return /^[A-Z]{3}$/.test(s);
}

function pickAmountKey(headers: string[]): string | null {
  return (
    pickFirst(
      headers,
      (h) =>
        h.includes("net share") &&
        h.includes("account") &&
        h.includes("currency")
    ) ||
    pickFirst(headers, (h) => h.includes("net") && h.includes("amount")) ||
    pickFirst(headers, (h) => h.includes("net") && h.includes("revenue")) ||
    pickFirst(headers, (h) => h.includes("amount")) ||
    pickFirst(headers, (h) => h.includes("revenue")) ||
    pickFirst(headers, (h) => h.includes("payout")) ||
    null
  );
}

function pickCurrencyKey(headers: string[]): string | null {
  return (
    pickFirst(headers, (h) => h.includes("account currency")) ||
    pickFirst(headers, (h) => h === "currency") ||
    pickFirst(headers, (h) => h.includes("currency")) ||
    null
  );
}

function inferCurrency(
  raw: Record<string, unknown>,
  headers: string[],
  currencyKey: string | null
): string {
  let currency = currencyKey ? str(raw[currencyKey]).toUpperCase() : "";

  if (currency && !looksLikeCurrency(currency)) {
    currency = "";
  }

  if (!currency) {
    for (const header of headers) {
      const value = raw[header];
      if (looksLikeCurrency(value)) {
        currency = str(value).toUpperCase();
        break;
      }
    }
  }

  return currency;
}

export const fallbackAdapter: ImportAdapter = {
  key: "fallback",

  sniff(_headers: string[]) {
    return 0.01;
  },

  normalize(raw: Record<string, unknown>): NormalizeResult {
    const headers = Object.keys(raw);

    const amountKey = pickAmountKey(headers);
    const currencyKey = pickCurrencyKey(headers);

    const isrcKey =
      pickFirst(headers, (h) => h === "isrc" || h.includes("isrc")) || null;

    const upcKey =
      pickFirst(headers, (h) => h === "upc" || h.includes("upc")) || null;

    const storeKey =
      pickFirst(
        headers,
        (h) => h === "store" || h.includes("store") || h.includes("service")
      ) || null;

    const dateKey =
      pickFirst(
        headers,
        (h) =>
          h.includes("transaction date") || h === "date" || h.includes("date")
      ) || null;

    const periodKey =
      pickFirst(
        headers,
        (h) => h.includes("statement period") || h.includes("period")
      ) || null;

    const trackKey =
      pickFirst(
        headers,
        (h) =>
          h === "track" ||
          h.includes("track title") ||
          h.includes("song") ||
          h.includes("title")
      ) || null;

    const productKey =
      pickFirst(
        headers,
        (h) => h === "product" || h.includes("release") || h.includes("album")
      ) || null;

    const artistKey =
      pickFirst(headers, (h) => h.includes("artist")) || null;

    const qtyKey =
      pickFirst(
        headers,
        (h) => h.includes("quantity") || h.includes("qty") || h.includes("units")
      ) || null;

    const amount = amountKey ? num(raw[amountKey]) : null;
    const currency = inferCurrency(raw, headers, currencyKey);

    const warnings: string[] = ["heuristic_mapping_used"];

    if (amount === null) {
      return {
        error: `Fallback could not find a valid amount column. First headers: ${headers
          .slice(0, 15)
          .join(", ")}`,
        warnings,
      };
    }

    if (!currency) {
      return {
        error: `Missing currency (fallback). Detected amountKey=${
          amountKey ?? "none"
        } currencyKey=${currencyKey ?? "none"}`,
        warnings,
      };
    }

    const normalized: NormalizedRow = {
      provider: "unknown",
      amount,
      currency,
      isrc: isrcKey ? str(raw[isrcKey]) || undefined : undefined,
      upc: upcKey ? str(raw[upcKey]) || undefined : undefined,
      store: storeKey ? str(raw[storeKey]) || undefined : undefined,
      transaction_date: dateKey ? str(raw[dateKey]) || undefined : undefined,
      statement_period: periodKey ? str(raw[periodKey]) || undefined : undefined,
      track_title: trackKey ? str(raw[trackKey]) || undefined : undefined,
      release_title: productKey ? str(raw[productKey]) || undefined : undefined,
      artist: artistKey ? str(raw[artistKey]) || undefined : undefined,
      quantity: qtyKey ? num(raw[qtyKey]) ?? undefined : undefined,
    };

    return {
      normalized,
      warnings,
    };
  },
};

