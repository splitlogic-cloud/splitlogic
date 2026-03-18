export type NormalizedRow = {
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
};

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

export type ImportAdapter = {
  key: string;
  sniff: (headers: string[]) => number;
  normalize: (raw: Record<string, unknown>) => NormalizeResult;
};