export type AllocationRunStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type AllocationCandidateStatus =
  | "pending"
  | "eligible"
  | "blocked"
  | "allocated"
  | "failed";

export type AllocationBlockerCode =
  | "missing_work_match"
  | "missing_splits"
  | "split_sum_not_100"
  | "missing_party"
  | "inactive_split"
  | "invalid_work"
  | "currency_missing"
  | "amount_missing"
  | "unsupported_row_type"
  | "invalid_amount_sign"
  | "duplicate_candidate"
  | "line_sum_mismatch"
  | "unknown_error";

export type SplitSnapshotItem = {
  splitId: string | null;
  partyId: string | null;
  shareFraction: number;
  role?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  sortOrder?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type WorkSnapshot = {
  id: string;
  title: string | null;
  artist: string | null;
  isrc: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AllocationCandidateRecord = {
  id: string;
  company_id: string;
  allocation_run_id: string;
  import_job_id: string;
  import_row_id: string;
  work_id: string | null;
  status: AllocationCandidateStatus;
  currency: string | null;
  gross_amount: string | null;
  net_amount: string | null;
  raw_row_snapshot: Record<string, unknown>;
  normalized_row_snapshot: Record<string, unknown>;
  work_snapshot: WorkSnapshot | Record<string, unknown>;
  split_snapshot: SplitSnapshotItem[];
  blocker_code: AllocationBlockerCode | null;
  blocker_message: string | null;
  candidate_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type AllocationBlockerRecord = {
  id: string;
  company_id: string;
  allocation_run_id: string;
  allocation_candidate_id: string;
  import_row_id: string;
  work_id: string | null;
  blocker_code: AllocationBlockerCode;
  message: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type AllocationLineInsert = {
  company_id: string;
  allocation_run_id: string;
  allocation_candidate_id: string;
  import_job_id: string;
  import_row_id: string;
  work_id: string;
  party_id: string;
  source_split_id: string | null;
  split_snapshot: Record<string, unknown>;
  gross_source_amount: number;
  net_source_amount: number;
  share_fraction: number;
  allocated_amount: number;
  currency: string;
  line_type: "royalty_share";
  calc_trace: Record<string, unknown>;
};

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
  blockerBreakdown: Array<{
    blockerCode: string;
    count: number;
  }>;
};

export type ImportRowForAllocation = {
  id: string;
  company_id: string;
  import_job_id: string;
  work_id: string | null;
  currency: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  status: string | null;
  raw_payload?: Record<string, unknown> | null;
  normalized_payload?: Record<string, unknown> | null;
  title?: string | null;
  artist?: string | null;
  isrc?: string | null;
};

export type SplitForAllocation = {
  id: string;
  company_id: string;
  work_id: string;
  party_id: string | null;
  share_fraction: number | null;
  status?: string | null;
  role?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  created_at?: string | null;
};