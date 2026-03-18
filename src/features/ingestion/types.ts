export type FileKind = "csv" | "txt" | "xlsx" | "pdf" | "unknown";

export type ParsedMatrix = {
  rows: string[][];
  headerRowIndex: number;
  headers: string[];
};

export type CanonicalImportRow = {
  source_file_type: FileKind;
  source_name: string | null;
  statement_period: string | null;

  title: string | null;
  artist: string | null;
  release_title: string | null;

  isrc: string | null;
  upc: string | null;

  territory: string | null;
  store: string | null;

  quantity: number | null;
  net_amount: number | null;
  gross_amount: number | null;
  currency: string | null;

  sale_date: string | null;
  raw: Record<string, unknown>;
};

export type NormalizedRow = {
  canonical: CanonicalImportRow;
  raw: Record<string, unknown>;
};

export type DetectSourceResult = {
  adapterKey: string;
  sourceName: string | null;
  confidence: number;
};

export type AdapterContext = {
  fileKind: FileKind;
  fileName: string;
  headers: string[];
  rows: string[][];
  headerRowIndex: number;
};

export type ImportAdapter = {
  key: string;
  displayName: string;
  canHandle: (ctx: AdapterContext) => number;
  normalize: (ctx: AdapterContext) => NormalizedRow[];
};