"use server";

// Importera supabaseAdmin typ om du vill ha extra säkerhet
import { Database } from "@/lib/supabase/types";

// --- Import Row & Split typer ---
export type ImportRowForAllocation = {
  id: string;
  company_id: string;
  import_job_id: string;
  work_id: string | null;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  currency: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  status: "parsed" | "matched" | "allocated" | "needs_review";
  raw_payload: Record<string, unknown>;
  normalized_payload: Record<string, unknown>;
};

export type SplitForAllocation = {
  id: string;
  company_id: string;
  work_id: string;
  party_id: string | null;
  share_fraction: number;
  role: string | null;
  status: "active" | "inactive";
  valid_from: string | null;
  valid_to: string | null;
  created_at: string | null;
};

export type AllocationLineInsert = {
  allocation_run_id: string;
  import_row_id: string;
  work_id: string;
  party_id: string;
  source_split_id: string | null;
  share_fraction: number;
  gross_source_amount: number;
  net_source_amount: number;
  allocated_amount: number;
  currency: string | null;
  line_type: "primary" | "secondary";
  calc_trace: Record<string, unknown> | null;
  created_at: string;
};

export type AllocationBlockerCode =
  | "missing_work_match"
  | "currency_missing"
  | "amount_missing"
  | "missing_splits"
  | "missing_party"
  | "split_sum_not_100"
  | "invalid_work"
  | "unsupported_row_type";

// --- Ny: AllocationRunSummary typ ---
export type AllocationRunSummary = {
  inputRowCount: number;
  matchedRowCount: number;
  candidateRowCount: number;
  eligibleRowCount: number;
  blockedRowCount: number;
  allocatedRowCount: number;
  unallocatedRowCount: number;
  blockerCount: number;
  lineCount: number;
  grossAmountTotal: number;
  netAmountTotal: number;
  allocatedAmountTotal: number;
  unallocatedAmountTotal: number;
  blockerBreakdown: { blockerCode: string; count: number }[];
};

export type AllocationRunResult = {
  runId: string;
  inputRowCount: number;
  allocatedRowCount: number;
  blockerCount: number;
  grossAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  currency: string | null;
};

export type WorkSnapshot = {
  id: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  metadata: null;
};

export type SplitSnapshotItem = {
  splitId: string;
  partyId: string;
  shareFraction: number;
  role: string | null;
  validFrom: string | null;
  validTo: string | null;
  sortOrder: number;
  metadata: null;
};