import type { ImportAdapter, NormalizeResult, NormalizedRow } from "../registry";

function normHeader(h: string) {
  return (h ?? "").toString().trim().toLowerCase();
}
function str(v: any) {
  return (v ?? "").toString().trim();
}
function num(v: any) {
  const s = str(v);
  if (!s) return null;
  // handle "1,23" and "1.23"
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function pickFirst(headers: string[], pred: (h: string) => boolean) {
  return headers.find((h) => pred(normHeader(h)));
}

function looksLikeCurrency(v: any) {
  const s = str(v).toUpperCase();
  return /^[A-Z]{3}$/.test(s);
}

export const fallbackAdapter: ImportAdapter = {
  key: "fallback",

  // very low on purpose, so real adapters win
  sniff(_headers: string[]) {
    return 0.01;
  },

  normalize(raw: Record<string, any>): NormalizeResult {
    const headers = Object.keys(raw);

    // Heuristics for amount column
    const amountKey =
      pickFirst(headers, (h) => h.includes("net share") && h.includes("account") && h.includes("currency")) ||
      pickFirst(headers, (h) => h.includes("net") && h.includes("amount")) ||
      pickFirst(headers, (h) => h.includes("net") && h.includes("revenue")) ||
      pickFirst(headers, (h) => h.includes("amount")) ||
      pickFirst(headers, (h) => h.includes("revenue")) ||
      pickFirst(headers, (h) => h.includes("payout")) ||
      null;

    // Heuristics for currency column
    const currencyKey =
      pickFirst(headers, (h) => h.includes("account currency")) ||
      pickFirst(headers, (h) => h === "currency") ||
      pickFirst(headers, (h) => h.includes("currency")) ||
      null;

    const amount = amountKey ? num(raw[amountKey]) : null;
    let currency = currencyKey ? str(raw[currencyKey]).toUpperCase() : "";

    // If currency column exists but value is not ISO, attempt to infer from nearby keys
    if (currency && !looksLikeCurrency(currency)) currency = "";

    // If still no currency, try to find any value that looks like ISO currency
    if (!currency) {
      for (const k of headers) {
        const v = raw[k];
        if (looksLikeCurrency(v)) {
          currency = str(v).toUpperCase();
          break;
        }
      }
    }

    // other common keys
    const isrcKey = pickFirst(headers, (h) => h === "isrc" || h.includes("isrc")) || null;
    const upcKey = pickFirst(headers, (h) => h === "upc" || h.includes("upc")) || null;
    const storeKey = pickFirst(headers, (h) => h === "store" || h.includes("store") || h.includes("service")) || null;
    const dateKey =
      pickFirst(headers, (h) => h.includes("transaction date") || h === "date" || h.includes("date")) || null;
    const periodKey = pickFirst(headers, (h) => h.includes("statement period") || h.includes("period")) || null;

    const trackKey =
      pickFirst(headers, (h) => h === "track" || h.includes("track title") || h.includes("song") || h.includes("title")) ||
      null;

    const productKey =
      pickFirst(headers, (h) => h === "product" || h.includes("release") || h.includes("album")) || null;

    const artistKey =
      pickFirst(headers, (h) => h.includes("artist")) || null;

    const qtyKey =
      pickFirst(headers, (h) => h.includes("quantity") || h.includes("qty") || h.includes("units")) || null;

    const warnings: string[] = ["heuristic_mapping_used"];

    if (amount === null) {
      return {
        error: `Fallback could not find a valid amount column. First headers: ${headers.slice(0, 15).join(", ")}`,
        warnings,
      };
    }

    if (!currency) {
      // allow normalize but mark invalid (better UX: rows show errors)
      return {
        error: `Missing currency (fallback). Detected amountKey=${amountKey ?? "none"} currencyKey=${currencyKey ?? "none"}`,
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

      quantity: qtyKey ? (num(raw[qtyKey]) ?? undefined) : undefined,
    };

    return { normalized, warnings };
  },
};