import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

type StatementPdfHeader = {
  id: string;
  party_name?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type StatementPdfLine = {
  id: string;
  title?: string | null;
  artist?: string | null;
  isrc?: string | null;
  platform?: string | null;
  territory?: string | null;
  transaction_date?: string | null;
  amount?: number | null;
  currency?: string | null;
  units?: number | null;
};

type BuildStatementPdfParams = {
  header: StatementPdfHeader;
  lines: StatementPdfLine[];
};

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";

  const formatted = new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return currency ? `${formatted} ${currency}` : formatted;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color,
  });
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export async function buildStatementPdf({
  header,
  lines,
}: BuildStatementPdfParams): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();

  const marginLeft = 40;
  const marginRight = 40;

  let cursorY = height - 40;

  drawText(page, "Statement", marginLeft, cursorY, 22, fontBold);
  cursorY -= 28;

  drawText(
    page,
    `Recipient: ${header.party_name ?? "—"}`,
    marginLeft,
    cursorY,
    11,
    fontRegular
  );
  cursorY -= 16;

  drawText(
    page,
    `Period: ${formatDate(header.period_start)} → ${formatDate(header.period_end)}`,
    marginLeft,
    cursorY,
    11,
    fontRegular
  );
  cursorY -= 16;

  drawText(
    page,
    `Statement ID: ${header.id}`,
    marginLeft,
    cursorY,
    11,
    fontRegular
  );
  cursorY -= 16;

  drawText(
    page,
    `Status: ${header.status ?? "—"}`,
    marginLeft,
    cursorY,
    11,
    fontRegular
  );
  cursorY -= 16;

  drawText(
    page,
    `Created: ${formatDate(header.created_at)}`,
    marginLeft,
    cursorY,
    11,
    fontRegular
  );

  drawText(
    page,
    `Total: ${formatMoney(header.total_amount ?? null, header.currency ?? null)}`,
    width - 240,
    height - 68,
    14,
    fontBold
  );

  cursorY -= 26;

  const tableTopY = cursorY;
  const rowHeight = 18;

  const col1 = marginLeft;
  const col2 = marginLeft + 70;
  const col3 = marginLeft + 290;
  const col4 = marginLeft + 470;
  const col5 = marginLeft + 560;

  page.drawLine({
    start: { x: marginLeft, y: tableTopY + 6 },
    end: { x: width - marginRight, y: tableTopY + 6 },
    thickness: 1,
    color: rgb(0.75, 0.75, 0.75),
  });

  drawText(page, "Date", col1, tableTopY - 8, 10, fontBold);
  drawText(page, "Title / Artist", col2, tableTopY - 8, 10, fontBold);
  drawText(page, "ISRC / Platform", col3, tableTopY - 8, 10, fontBold);
  drawText(page, "Territory", col4, tableTopY - 8, 10, fontBold);
  drawText(page, "Amount", col5, tableTopY - 8, 10, fontBold);

  let rowY = tableTopY - 28;
  const visibleLines = lines.slice(0, 18);

  if (visibleLines.length === 0) {
    drawText(page, "No statement lines found.", marginLeft, rowY, 10, fontRegular);
  } else {
    for (const line of visibleLines) {
      drawText(
        page,
        truncate(formatDate(line.transaction_date ?? null), 12),
        col1,
        rowY,
        9,
        fontRegular
      );
      drawText(
        page,
        truncate(`${line.title ?? "—"} / ${line.artist ?? "—"}`, 36),
        col2,
        rowY,
        9,
        fontRegular
      );
      drawText(
        page,
        truncate(`${line.isrc ?? "—"} / ${line.platform ?? "—"}`, 28),
        col3,
        rowY,
        9,
        fontRegular
      );
      drawText(page, truncate(line.territory ?? "—", 12), col4, rowY, 9, fontRegular);
      drawText(
        page,
        truncate(formatMoney(line.amount ?? null, line.currency ?? header.currency ?? null), 22),
        col5,
        rowY,
        9,
        fontRegular
      );

      rowY -= rowHeight;
    }
  }

  if (lines.length > 18) {
    drawText(
      page,
      `+ ${lines.length - 18} more lines not shown in this PDF preview`,
      marginLeft,
      Math.max(40, rowY - 8),
      9,
      fontRegular,
      rgb(0.4, 0.4, 0.4)
    );
  }

  drawText(
    page,
    "Generated by SplitLogic",
    marginLeft,
    20,
    9,
    fontRegular,
    rgb(0.45, 0.45, 0.45)
  );

  return await pdf.save();
}