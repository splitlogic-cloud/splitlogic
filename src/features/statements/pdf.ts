import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type StatementPdfHeader = {
  statementId: string;
  companyName: string;
  partyName: string;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
  totalAmount: number;
  status: string | null;
  createdAt: string | null;
};

export type StatementPdfLine = {
  workTitle: string | null;
  sourceAmount: number;
  sharePercent: number;
  allocatedAmount: number;
  currency: string | null;
};

function money(n: number, currency = "SEK") {
  return `${n.toFixed(2)} ${currency}`;
}

function drawHeader(params: {
  page: any;
  bold: any;
  font: any;
  header: StatementPdfHeader;
  width: number;
}) {
  const { page, bold, font, header, width } = params;

  page.drawRectangle({
    x: 0,
    y: 760,
    width,
    height: 82,
    color: rgb(0.08, 0.08, 0.1),
  });

  page.drawText(header.companyName || "SplitLogic", {
    x: 40,
    y: 805,
    size: 22,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Royalty Statement", {
    x: 40,
    y: 785,
    size: 11,
    font,
    color: rgb(0.88, 0.88, 0.9),
  });

  page.drawText(`Statement ID: ${header.statementId}`, {
    x: 380,
    y: 805,
    size: 9,
    font,
    color: rgb(0.88, 0.88, 0.9),
  });

  page.drawText(`Status: ${header.status ?? "draft"}`, {
    x: 380,
    y: 790,
    size: 9,
    font,
    color: rgb(0.88, 0.88, 0.9),
  });
}

function drawSummary(params: {
  page: any;
  bold: any;
  font: any;
  header: StatementPdfHeader;
}) {
  const { page, bold, font, header } = params;

  page.drawText("Party", {
    x: 40,
    y: 730,
    size: 9,
    font: bold,
    color: rgb(0.35, 0.35, 0.4),
  });
  page.drawText(header.partyName, {
    x: 40,
    y: 715,
    size: 11,
    font,
    color: rgb(0.1, 0.1, 0.12),
  });

  page.drawText("Period", {
    x: 220,
    y: 730,
    size: 9,
    font: bold,
    color: rgb(0.35, 0.35, 0.4),
  });
  page.drawText(
    `${header.periodStart ?? "—"} → ${header.periodEnd ?? "—"}`,
    {
      x: 220,
      y: 715,
      size: 11,
      font,
      color: rgb(0.1, 0.1, 0.12),
    }
  );

  page.drawText("Total", {
    x: 420,
    y: 730,
    size: 9,
    font: bold,
    color: rgb(0.35, 0.35, 0.4),
  });
  page.drawText(
    money(header.totalAmount, header.currency ?? "SEK"),
    {
      x: 420,
      y: 715,
      size: 14,
      font: bold,
      color: rgb(0.1, 0.1, 0.12),
    }
  );
}

export async function buildStatementPdf(params: {
  header: StatementPdfHeader;
  lines: StatementPdfLine[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595, 842]);
  let { width, height } = page.getSize();

  drawHeader({
    page,
    bold,
    font,
    header: params.header,
    width,
  });

  drawSummary({
    page,
    bold,
    font,
    header: params.header,
  });

  let y = 665;

  const columns = {
    work: 40,
    source: 300,
    share: 395,
    allocated: 470,
  };

  const drawTableHeader = () => {
    page.drawRectangle({
      x: 40,
      y: y - 6,
      width: width - 80,
      height: 22,
      color: rgb(0.95, 0.96, 0.98),
    });

    page.drawText("Work", {
      x: columns.work,
      y,
      size: 10,
      font: bold,
      color: rgb(0.15, 0.15, 0.18),
    });
    page.drawText("Source", {
      x: columns.source,
      y,
      size: 10,
      font: bold,
      color: rgb(0.15, 0.15, 0.18),
    });
    page.drawText("Share %", {
      x: columns.share,
      y,
      size: 10,
      font: bold,
      color: rgb(0.15, 0.15, 0.18),
    });
    page.drawText("Allocated", {
      x: columns.allocated,
      y,
      size: 10,
      font: bold,
      color: rgb(0.15, 0.15, 0.18),
    });

    y -= 26;
  };

  drawTableHeader();

  for (const line of params.lines) {
    if (y < 60) {
      page = pdf.addPage([595, 842]);
      ({ width, height } = page.getSize());

      drawHeader({
        page,
        bold,
        font,
        header: params.header,
        width,
      });

      y = 720;
      drawTableHeader();
    }

    page.drawText(line.workTitle ?? "Untitled work", {
      x: columns.work,
      y,
      size: 9,
      font,
      color: rgb(0.1, 0.1, 0.12),
      maxWidth: 240,
    });

    page.drawText(line.sourceAmount.toFixed(6), {
      x: columns.source,
      y,
      size: 9,
      font,
      color: rgb(0.1, 0.1, 0.12),
    });

    page.drawText(line.sharePercent.toFixed(6), {
      x: columns.share,
      y,
      size: 9,
      font,
      color: rgb(0.1, 0.1, 0.12),
    });

    page.drawText(
      money(line.allocatedAmount, line.currency ?? params.header.currency ?? "SEK"),
      {
        x: columns.allocated,
        y,
        size: 9,
        font,
        color: rgb(0.1, 0.1, 0.12),
      }
    );

    y -= 16;
  }

  return await pdf.save();
}