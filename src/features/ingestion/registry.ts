import { ImportAdapter } from "./types";
import { genericAdapter } from "./adapters/generic.adapter";
import { believeAdapter } from "./adapters/believe.adapter";
import { fugaAdapter } from "./adapters/fuga.adapter";

export const adapters: ImportAdapter[] = [
  believeAdapter,
  fugaAdapter,
  genericAdapter,
];

export function getAdapterByKey(key: string): ImportAdapter | null {
  return adapters.find((adapter) => adapter.key === key) ?? null;
}