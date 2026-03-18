import type { ImportAdapter } from "./types";

import { genericAdapter } from "./adapters/generic.adapter";
import { believeAdapter } from "./adapters/believe.adapter";
import { fugaAdapter } from "./adapters/fuga.adapter";
import { fallbackAdapter } from "./adapters/fallback.adapter";

export const adapters: ImportAdapter[] = [
  believeAdapter,
  fugaAdapter,
  genericAdapter,
  fallbackAdapter, // 👈 viktigt: alltid sist
];

export function getAdapterByKey(key: string): ImportAdapter | null {
  return adapters.find((adapter) => adapter.key === key) ?? null;
}

export function detectBestAdapter(headers: string[]): ImportAdapter {
  let best: { adapter: ImportAdapter; score: number } | null = null;

  for (const adapter of adapters) {
    const score = adapter.sniff(headers);

    if (!best || score > best.score) {
      best = { adapter, score };
    }
  }

  return best?.adapter ?? fallbackAdapter;
}