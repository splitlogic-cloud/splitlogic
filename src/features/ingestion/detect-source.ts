import type { AdapterContext, DetectSourceResult } from "./types";
import { adapters } from "./registry";

export function detectImportSource(ctx: AdapterContext): DetectSourceResult {
  let best: DetectSourceResult = {
    adapterKey: "fallback",
    sourceName: null,
    confidence: 0,
  };

  for (const adapter of adapters) {
    const confidence = adapter.canHandle(ctx);

    if (confidence > best.confidence) {
      best = {
        adapterKey: adapter.key,
        sourceName: adapter.displayName,
        confidence,
      };
    }
  }

  return best;
}