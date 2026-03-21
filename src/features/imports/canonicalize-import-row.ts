import {
    CanonicalImportRow,
    CanonicalizationErrorCode,
    CanonicalizationResult,
    NormalizedImportRow,
    RawImportRow,
  } from "./import-types";
  
  function toCleanString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s.length > 0 ? s : null;
  }
  
  function toUpperText(value: string | null): string | null {
    return value ? value.trim().toUpperCase() : null;
  }
  
  function pickFirst(...values: Array<unknown>): string | null {
    for (const value of values) {
      const s = toCleanString(value);
      if (s) return s;
    }
    return null;
  }
  
  function parseNumericString(value: string | null): string | null {
    if (!value) return null;
  
    const cleaned = value
      .replace(/\u00A0/g, "")
      .replace(/\s+/g, "")
      .replace(/,/g, ".");
  
    if (!cleaned) return null;
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  
    return cleaned;
  }
  
  export function canonicalizeImportRow(
    raw: RawImportRow,
    sourcePlatform: string,
  ): CanonicalizationResult {
    const normalized: NormalizedImportRow = {
      sourcePlatform: toCleanString(sourcePlatform),
      sourceCurrency: toUpperText(
        pickFirst(
          raw["currency"],
          raw["Currency"],
          raw["ACCOUNT CURRENCY"],
          raw["account_currency"],
        ),
      ),
      sourceNetAmount: pickFirst(
        raw["net_amount"],
        raw["amount"],
        raw["Amount"],
        raw["NET SHARE ACCOUNT CURRENCY"],
      ),
      sourceGrossAmount: pickFirst(
        raw["gross_amount"],
        raw["Gross Amount"],
        raw["GROSS REVENUE ACCOUNT CURRENCY"],
      ),
      sourceTrackTitle: pickFirst(
        raw["track_title"],
        raw["Track Title"],
        raw["track"],
        raw["title"],
      ),
      sourceArtistName: pickFirst(
        raw["artist_name"],
        raw["Artist Name"],
        raw["artist"],
      ),
      sourceIsrc: pickFirst(raw["isrc"], raw["ISRC"]),
      sourceUpc: pickFirst(raw["upc"], raw["UPC"]),
      sourceWorkRef: pickFirst(
        raw["work_ref"],
        raw["work_id"],
        raw["Work ID"],
        raw["isrc"],
        raw["ISRC"],
        raw["track_title"],
        raw["Track Title"],
      ),
    };
  
    const currency = normalized.sourceCurrency;
    const netAmount = parseNumericString(normalized.sourceNetAmount);
    const grossAmount = parseNumericString(normalized.sourceGrossAmount);
    const sourceWorkRef = normalized.sourceWorkRef;
  
    const canonical: CanonicalImportRow = {
      currency,
      net_amount: netAmount,
      gross_amount: grossAmount,
      work_ref: sourceWorkRef,
      isrc: normalized.sourceIsrc,
      upc: normalized.sourceUpc,
      track_title: normalized.sourceTrackTitle,
      artist_name: normalized.sourceArtistName,
      source_platform: normalized.sourcePlatform,
    };
  
    const errorCodes: CanonicalizationErrorCode[] = [];
  
    if (!currency) {
      errorCodes.push("missing_currency");
    }
  
    if (!netAmount && !grossAmount) {
      errorCodes.push("missing_amount");
    }
  
    if (
      normalized.sourceNetAmount &&
      !netAmount &&
      !errorCodes.includes("invalid_amount")
    ) {
      errorCodes.push("invalid_amount");
    }
  
    if (!sourceWorkRef) {
      errorCodes.push("missing_work_ref");
    }
  
    const rowStatus = errorCodes.includes("missing_currency") ||
      errorCodes.includes("missing_amount")
      ? "invalid"
      : "parsed";
  
    return {
      normalized,
      canonical,
      currency,
      netAmount,
      grossAmount,
      sourceWorkRef,
      rowStatus,
      errorCodes,
    };
  }