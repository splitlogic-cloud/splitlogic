import "server-only";

export type ParsedCsvRow = {
  rowIndex: number;
  raw: Record<string, string>;
  errorCode: string | null;
  errorMessage: string | null;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out.map((v) => v.trim());
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, "_");
}

export function parseCsvText(text: string): ParsedCsvRow[] {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);

  const rows: ParsedCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);

    const raw: Record<string, string> = {};

    for (let c = 0; c < headers.length; c++) {
      raw[headers[c] || `column_${c + 1}`] = values[c] ?? "";
    }

    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    if (values.length === 0 || Object.values(raw).every((v) => !String(v).trim())) {
      errorCode = "empty_row";
      errorMessage = "CSV row is empty";
    }

    rows.push({
      rowIndex: i,
      raw,
      errorCode,
      errorMessage,
    });
  }

  return rows;
}