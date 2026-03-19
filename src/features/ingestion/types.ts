export type PrimitiveValue = string | number | boolean | null | undefined;
export type CanonicalExtraValue =
  | PrimitiveValue
  | Record<string, unknown>
  | unknown[]
  | Date;

export type FileKind = "csv" | "txt" | "xlsx" | "pdf" | "unknown";

export type ParsedMatrix = {
  rows: string[][];
  headerRowIndex: number;
  headers: string[];
};

export type CanonicalImportRow = {
  provider?: string | null;

  amount?: number | null;
  currency?: string | null;

  title?: string | null;
  track_title?: string | null;
  release_title?: string | null;
  artist?: string | null;

  isrc?: string | null;
  upc?: string | null;
  store?: string | null;

  transaction_date?: string | null;
  statement_period?: string | null;
  sale_date?: string | null;

  quantity?: number | null;

  country?: string | null;
  territory?: string | null;
  region?: string | null;
  territory_code?: string | null;

  product_type?: string | null;
  sales_type?: string | null;
  royalty_type?: string | null;
  usage_type?: string | null;
  service?: string | null;

  raw_title?: string | null;
  raw_artist?: string | null;

  source_name?: string | null;
  source_file_type?: string | null;
  adapter_key?: string | null;

  sale_currency?: string | null;
  account_currency?: string | null;

  gross_sale?: number | null;
  gross_amount?: number | null;
  net_revenue?: number | null;
  net_amount?: number | null;

  release_id?: string | null;
  track_id?: string | null;
  product_id?: string | null;

  label?: string | null;

  raw?: Record<string, unknown> | undefined;

  [key: string]: CanonicalExtraValue;
};

export type NormalizedRow = {
  raw: Record<string, unknown>;
  canonical: CanonicalImportRow;
  warnings?: string[];
};

export type NormalizeResult =
  | {
      normalized: CanonicalImportRow;
      warnings?: string[];
      error?: undefined;
    }
  | {
      normalized?: undefined;
      warnings?: string[];
      error: string;
    };

export type AdapterContext = {
  headers: string[];
  rows: string[][];
  headerRowIndex: number;

  fileKind?: FileKind;
  fileName?: string;

  companyId?: string;
  companySlug?: string;
  importJobId?: string;

  sourceName?: string;
  sourceFileType?: string;
  adapterKey?: string;
};

export type ImportAdapter = {
  key: string;
  displayName: string;
  canHandle: (ctx: AdapterContext) => number;
  normalize: (ctx: AdapterContext) => NormalizedRow[];
};

export type DetectSourceResult = {
  adapterKey: string;
  sourceName: string | null;
  confidence: number;
};