import { ParsedMatrix } from "./types";

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function detectDelimiter(lines: string[]): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestScore = -1;

  for (const delimiter of candidates) {
    let score = 0;
    for (const line of lines.slice(0, 10)) {
      const count = line.split(delimiter).length;
      if (count > 1) score += count;
    }
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function scoreHeaderRow(row: string[]): number {
  const joined = row.join(" ").toLowerCase();

  let score = 0;
  const signals = [
    "title",
    "track",
    "artist",
    "isrc",
    "upc",
    "amount",
    "revenue",
    "earnings",
    "currency",
    "territory",
    "country",
    "quantity",
    "store",
    "service",
  ];

  for (const signal of signals) {
    if (joined.includes(signal)) score += 1;
  }

  return score;
}

export function parseDelimitedText(text: string): ParsedMatrix & { delimiter: string } {
  const clean = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return {
      rows: [],
      headerRowIndex: 0,
      headers: [],
      delimiter: ",",
    };
  }

  const delimiter = detectDelimiter(lines);
  const rows = lines.map((line) => parseDelimitedLine(line, delimiter));

  let headerRowIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const score = scoreHeaderRow(rows[i]);
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = i;
    }
  }

  const headers = rows[headerRowIndex] ?? [];

  return {
    rows,
    headerRowIndex,
    headers,
    delimiter,
  };
}