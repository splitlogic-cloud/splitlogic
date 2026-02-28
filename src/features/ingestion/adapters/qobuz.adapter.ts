import type { ImportAdapter, NormalizeResult } from "../registry";

function str(v: any) {
  return (v ?? "").toString().trim();
}
function num(v: any) {
  const s = str(v);
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export const qobuzAdapter: ImportAdapter = {
  key: "qobuz",

  sniff(headers: string[]) {
    const set = new Set(headers.map((h) => h.trim().toUpperCase()));
    const must = [
      "STORE",
      "ACCOUNT CURRENCY",
      "NET SHARE ACCOUNT CURRENCY",
      "GROSS REVENUE ACCOUNT CURRENCY",
      "TRANSACTION DATE",
      "STATEMENT PERIOD",
    ];
    const hits = must.filter((k) => set.has(k)).length;
    return hits / must.length;
  },

  normalize(raw: Record<string, any>): NormalizeResult {
    const amount =
      num(raw["NET SHARE ACCOUNT CURRENCY"]) ??
      num(raw["GROSS REVENUE ACCOUNT CURRENCY"]);

    const currency = str(raw["ACCOUNT CURRENCY"]).toUpperCase();

    if (amount === null) return { error: "Missing amount (NET SHARE/GROSS REVENUE ACCOUNT CURRENCY)" };
    if (!currency) return { error: "Missing currency (ACCOUNT CURRENCY)" };
    if (currency.length !== 3) return { error: "Invalid currency (ACCOUNT CURRENCY)" };

    const quantity = num(raw["QUANTITY"]);

    return {
      normalized: {
        provider: "qobuz",
        store: str(raw["STORE"]),
        transaction_type: str(raw["TRANSACTION TYPE"]),
        sale_country: str(raw["SALE COUNTRY"]),
        transaction_date: str(raw["TRANSACTION DATE"]),
        statement_period: str(raw["STATEMENT PERIOD"]),
        amount,
        currency,
        gross_amount: num(raw["GROSS REVENUE ACCOUNT CURRENCY"]) ?? undefined,
        sale_amount: num(raw["GROSS REVENUE SALE CURRENCY"]) ?? undefined,
        sale_currency: str(raw["SALE CURRENCY"]).toUpperCase() || undefined,
        fx_rate: num(raw["CURRENCY CONVERSION RATE"]) ?? undefined,
        quantity: quantity ?? undefined,
        isrc: str(raw["ISRC"]) || undefined,
        upc: str(raw["DISPLAY UPC"]) || undefined,
        track_title: str(raw["TRACK"]) || undefined,
        release_title: str(raw["PRODUCT"]) || undefined,
        artist: str(raw["TRACK ARTIST"]) || str(raw["PRODUCT ARTIST"]) || undefined,
        label: str(raw["LABEL IMPRINT"]) || undefined,
        account_id: str(raw["ACCOUNT ID"]) || undefined,
        contract_id: str(raw["CONTRACT ID"]) || undefined,
        account_name: str(raw["ACCOUNT NAME"]) || undefined,
      },
      warnings: [],
    };
  },
};