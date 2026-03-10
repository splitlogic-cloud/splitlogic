export type ImportRowStatus =
  | "matched"
  | "partially_matched"
  | "unmatched"
  | "invalid";

export type ParsedRevenueRow = {
  rowNumber: number;
  rawJson: Record<string, string>;
  rawTitle: string | null;
  rawPartyName: string | null;
  rawAmount: number | null;
  rawCurrency: string | null;
  rawPeriodStart: string | null;
  rawPeriodEnd: string | null;
  rawExternalWorkId: string | null;
  rawExternalPartyId: string | null;
};