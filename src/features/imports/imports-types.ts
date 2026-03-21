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
  | "parsed"
  | "invalid"
  | "matched"
  | "unmatched"
  | "needs_review"
  | "allocated";

export type RawImportValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type RawImportRow = Record<string, RawImportValue>;

export type NormalizedImportRow = {
  raw: RawImportRow;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  currency: string | null;
  quantity: number | null;
  net_amount: number | null;
  gross_amount: number | null;
  statement_date: string | null;
  territory: string | null;
  source: string | null;
};

export type ParsedImportFile = {
  headers: string[];
  rows: RawImportRow[];
};