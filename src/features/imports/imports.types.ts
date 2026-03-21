export type ImportJobStatus =
  | "uploaded"
  | "parsing"
  | "parsed"
  | "matching"
  | "matched"
  | "allocating"
  | "allocated"
  | "failed";

export type ImportRowStatus =
  | "pending"
  | "parsed"
  | "invalid"
  | "matched"
  | "unmatched"
  | "allocated";

export type RawImportRow = Record<string, unknown>;

export type NormalizedImportRow = {
  sourcePlatform: string | null;
  sourceCurrency: string | null;
  sourceNetAmount: string | null;
  sourceGrossAmount: string | null;
  sourceTrackTitle: string | null;
  sourceArtistName: string | null;
  sourceIsrc: string | null;
  sourceUpc: string | null;
  sourceWorkRef: string | null;
};

export type CanonicalImportRow = {
  currency: string | null;
  net_amount: string | null;
  gross_amount: string | null;
  work_ref: string | null;
  isrc: string | null;
  upc: string | null;
  track_title: string | null;
  artist_name: string | null;
  source_platform: string | null;
};

export type CanonicalizationErrorCode =
  | "missing_currency"
  | "missing_amount"
  | "missing_work_ref"
  | "invalid_amount";

export type CanonicalizationResult = {
  normalized: NormalizedImportRow;
  canonical: CanonicalImportRow;
  currency: string | null;
  netAmount: string | null;
  grossAmount: string | null;
  sourceWorkRef: string | null;
  rowStatus: "parsed" | "invalid";
  errorCodes: CanonicalizationErrorCode[];
};