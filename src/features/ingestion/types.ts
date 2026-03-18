export type CanonicalImportRow = {
  provider: string;

  amount: number;
  currency: string;

  isrc?: string | undefined;
  upc?: string | undefined;
  store?: string | undefined;

  transaction_date?: string | undefined;
  statement_period?: string | undefined;

  track_title?: string | undefined;
  release_title?: string | undefined;
  artist?: string | undefined;

  quantity?: number | undefined;

  country?: string | undefined;
  territory?: string | undefined;
  product_type?: string | undefined;
  sales_type?: string | undefined;

  raw_title?: string | undefined;
  raw_artist?: string | undefined;

  source_name?: string | undefined;
  source_file_type?: string | undefined;
  adapter_key?: string | undefined;

  sale_currency?: string | undefined;
  account_currency?: string | undefined;

  gross_sale?: number | undefined;
  net_revenue?: number | undefined;
  net_amount?: number | undefined;

  release_id?: string | undefined;
  track_id?: string | undefined;
  product_id?: string | undefined;

  label?: string | undefined;
  royalty_type?: string | undefined;
  usage_type?: string | undefined;
  service?: string | undefined;

  region?: string | undefined;
  territory_code?: string | undefined;
};

export type NormalizedRow = CanonicalImportRow;

export type NormalizeResult =
  | {
      normalized: NormalizedRow;
      warnings?: string[];
      error?: undefined;
    }
  | {
      normalized?: undefined;
      warnings?: string[];
      error: string;
    };

export type AdapterContext = {
  companyId?: string;
  companySlug?: string;
  importJobId?: string;
  sourceName?: string;
  sourceFileType?: string;
  adapterKey?: string;
  fileKind?: string;
};

export type ImportAdapter = {
  key: string;
  sniff: (headers: string[]) => number;
  normalize: (
    raw: Record<string, unknown>,
    context?: AdapterContext
  ) => NormalizeResult;
};