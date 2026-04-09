import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ReportPdfGroup = {
  name: string;
  amount: number;
  rows: number;
};

export type ReportPdfRow = {
  title: string;
  artist: string;
  country: string;
  service: string;
  statementDate: string | null;
  amount: number;
  currency: string | null;
};

export type ReportPdfFilters = {
  periodStart: string | null;
  periodEnd: string | null;
  country: string | null;
  title: string | null;
  artist: string | null;
  service: string | null;
};

export type BuildReportPdfParams = {
  companyName: string;
  generatedAt: string;
  filters: ReportPdfFilters;
  totalRows: number;
  totalAmount: number;
  currencies: string[];
  topSongs: ReportPdfGroup[];
  topArtists: ReportPdfGroup[];
  topCountries: ReportPdfGroup[];
  rows: ReportPdfRow[];
  truncatedRowCount: number;
};

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return value;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = rgb(0, 0, 0)
) {
  page.drawText(text, { x, y, size, font, color });
}

function drawTopList(params: {
  page: PDFPage;
  title: string;
  items: ReportPdfGroup[];
  x: number;
  y: number;
  width: number;
  bold: PDFFont;
  regular: PDFFont;
}) {
  const { page, title, items, x, y, width, bold, regular } = params;
  drawText(page, title, x, y, 10, bold, rgb(0.1, 0.1, 0.12));

  let rowY = y - 16;
  const shown = items.slice(0, 5);
  if (shown.length === 0) {
    drawText(page, "No data", x, rowY, 9, regular, rgb(0.45, 0.45, 0.5));
    return;
  }

  for (let i = 0; i < shown.length; i += 1) {
    const item = shown[i];
    drawText(page, `${i + 1}. ${truncate(item.name, 24)}`, x, rowY, 9, regular);
    drawText(
      page,
      formatAmount(item.amount),
      x + width - 62,
      rowY,
      9,
      regular,
      rgb(0.1, 0.1, 0.12)
    );
    rowY -= 13;
  }
}

function drawTableHeader(params: {
  page: PDFPage;
  y: number;
  left: number;
  right: number;
  bold: PDFFont;
}) {
  const { page, y, left, right, bold } = params;
  page.drawRectangle({
    x: left,
    y: y - 7,
    width: right - left,
    height: 20,
    color: rgb(0.95, 0.96, 0.98),
  });

  drawText(page, "Date", left + 6, y, 9, bold, rgb(0.2, 0.2, 0.22));
  drawText(page, "Country", left + 74, y, 9, bold, rgb(0.2, 0.2, 0.22));
  drawText(page, "Title", left + 138, y, 9, bold, rgb(0.2, 0.2, 0.22));
  drawText(page, "Artist", left + 334, y, 9, bold, rgb(0.2, 0.2, 0.22));
  drawText(page, "Service", left + 500, y, 9, bold, rgb(0.2, 0.2, 0.22));
  drawText(page, "Amount", right - 80, y, 9, bold, rgb(0.2, 0.2, 0.22));
}

export async function buildReportPdf(params: BuildReportPdfParams): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const width = 842;
  const height = 595;
  const left = 28;
  const right = width - 28;

  let page = pdf.addPage([width, height]);
  let cursorY = height - 34;

  // Header bar
  page.drawRectangle({
    x: 0,
    y: height - 78,
    width,
    height: 78,
    color: rgb(0.08, 0.09, 0.12),
  });

  drawText(page, "Revenue Report", left, height - 34, 18, bold, rgb(1, 1, 1));
  drawText(
    page,
    truncate(params.companyName || "Company", 48),
    left,
    height - 54,
    10,
    regular,
    rgb(0.86, 0.89, 0.93)
  );
  drawText(
    page,
    `Generated ${params.generatedAt}`,
    right - 170,
    height - 54,
    9,
    regular,
    rgb(0.86, 0.89, 0.93)
  );

  cursorY = height - 100;
  const activeFilters = [
    params.filters.periodStart ? `from ${params.filters.periodStart}` : null,
    params.filters.periodEnd ? `to ${params.filters.periodEnd}` : null,
    params.filters.country ? `country ${params.filters.country}` : null,
    params.filters.title ? `title "${params.filters.title}"` : null,
    params.filters.artist ? `artist "${params.filters.artist}"` : null,
    params.filters.service ? `service ${params.filters.service}` : null,
  ].filter(Boolean);

  drawText(
    page,
    `Filters: ${activeFilters.length ? activeFilters.join(", ") : "none"}`,
    left,
    cursorY,
    9,
    regular,
    rgb(0.25, 0.25, 0.3)
  );

  // Summary row
  cursorY -= 24;
  page.drawRectangle({
    x: left,
    y: cursorY - 28,
    width: right - left,
    height: 30,
    color: rgb(0.97, 0.98, 1),
  });
  drawText(page, `Rows: ${params.totalRows}`, left + 10, cursorY - 16, 10, bold);
  drawText(
    page,
    `Total: ${formatAmount(params.totalAmount)}`,
    left + 170,
    cursorY - 16,
    10,
    bold
  );
  drawText(
    page,
    `Currencies: ${params.currencies.length ? params.currencies.join(", ") : "-"}`,
    left + 350,
    cursorY - 16,
    10,
    bold
  );

  // Top lists
  cursorY -= 56;
  drawTopList({
    page,
    title: "Top songs",
    items: params.topSongs,
    x: left,
    y: cursorY,
    width: 250,
    bold,
    regular,
  });
  drawTopList({
    page,
    title: "Top artists",
    items: params.topArtists,
    x: left + 260,
    y: cursorY,
    width: 250,
    bold,
    regular,
  });
  drawTopList({
    page,
    title: "Top countries",
    items: params.topCountries,
    x: left + 520,
    y: cursorY,
    width: 260,
    bold,
    regular,
  });

  cursorY -= 92;
  drawTableHeader({ page, y: cursorY, left, right, bold });
  cursorY -= 18;

  for (let index = 0; index < params.rows.length; index += 1) {
    const row = params.rows[index];
    if (cursorY < 36) {
      page = pdf.addPage([width, height]);
      drawText(page, "Revenue Report (continued)", left, height - 28, 12, bold);
      drawText(
        page,
        `${params.companyName} - page ${pdf.getPageCount()}`,
        left,
        height - 42,
        9,
        regular,
        rgb(0.45, 0.45, 0.5)
      );
      cursorY = height - 68;
      drawTableHeader({ page, y: cursorY, left, right, bold });
      cursorY -= 18;
    }

    drawText(page, formatDate(row.statementDate), left + 6, cursorY, 8.5, regular);
    drawText(page, truncate(row.country, 8), left + 74, cursorY, 8.5, regular);
    drawText(page, truncate(row.title, 34), left + 138, cursorY, 8.5, regular);
    drawText(page, truncate(row.artist, 28), left + 334, cursorY, 8.5, regular);
    drawText(page, truncate(row.service, 14), left + 500, cursorY, 8.5, regular);
    drawText(
      page,
      truncate(`${formatAmount(row.amount)} ${row.currency ?? ""}`.trim(), 18),
      right - 86,
      cursorY,
      8.5,
      regular
    );

    cursorY -= 12;
  }

  if (params.truncatedRowCount > 0) {
    if (cursorY < 28) {
      page = pdf.addPage([width, height]);
      cursorY = height - 28;
    }
    drawText(
      page,
      `Note: ${params.truncatedRowCount} additional rows were omitted from this PDF export.`,
      left,
      cursorY - 6,
      9,
      regular,
      rgb(0.45, 0.45, 0.5)
    );
  }

  return await pdf.save();
}
