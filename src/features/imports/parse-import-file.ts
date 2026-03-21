import "server-only";

import Papa from "papaparse";
import { detectImportSource } from "./source-adapters";
import type { RawImportRow } from "@/features/imports/imports-types";

export type ParsedImportFile = {
  sourceKey: string;
  rows: RawImportRow[];
  headers: string[];
};

export async function parseImportFile(fileText: string): Promise<ParsedImportFile> {
  const parsed = Papa.parse<Record<string, unknown>>(fileText, {
    header: true,
    skipEmptyLines: true,
    transformHeader(header) {
      return String(header).trim();
    },
  });

  if (parsed.errors.length > 0) {
    throw new Error(
      `CSV parse failed: ${parsed.errors.map((e) => e.message).join("; ")}`,
    );
  }

  const rows = parsed.data.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").trim() !== "")
  );

  const headers = Object.keys(rows[0] ?? {});
  const sourceKey = detectImportSource(headers);

  return {
    sourceKey,
    rows: rows as RawImportRow[],
    headers,
  };
}