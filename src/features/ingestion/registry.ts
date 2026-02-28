export type NormalizedRow = {
    provider: string;
  
    statement_period?: string;
    transaction_date?: string;
    transaction_type?: string;
    sale_country?: string;
    store?: string;
  
    amount?: number;
    currency?: string;
  
    gross_amount?: number;
    sale_amount?: number;
    sale_currency?: string;
    fx_rate?: number;
  
    quantity?: number;
  
    isrc?: string;
    upc?: string;
    track_title?: string;
    release_title?: string;
    artist?: string;
    label?: string;
  
    account_id?: string;
    contract_id?: string;
    account_name?: string;
  };
  
  export type NormalizeResult =
    | { normalized: NormalizedRow; warnings?: string[] }
    | { error: string; warnings?: string[] };
  
  export interface ImportAdapter {
    key: string;
    sniff(headers: string[]): number; // 0..1
    normalize(raw: Record<string, any>): NormalizeResult;
  }
  
  const adapters: ImportAdapter[] = [];
  
  export function registerAdapter(a: ImportAdapter) {
    adapters.push(a);
  }
  
  export function pickAdapter(headers: string[]) {
    let best: { a: ImportAdapter; score: number } | null = null;
    for (const a of adapters) {
      const score = a.sniff(headers);
      if (!best || score > best.score) best = { a, score };
    }
    if (!best || best.score < 0.5) return null;
    return best.a;
  }