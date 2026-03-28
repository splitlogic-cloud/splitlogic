-- ============================================
-- FAS 1: IMPORT RELIABILITY LAYER
-- SplitLogic Production Migration
-- ============================================

-- =========================
-- 1. import_jobs extensions
-- =========================

alter table import_jobs
add column if not exists active_run_token text,
add column if not exists current_step text,
add column if not exists locked_at timestamptz,

add column if not exists parsing_started_at timestamptz,
add column if not exists parsing_finished_at timestamptz,

add column if not exists matching_started_at timestamptz,
add column if not exists matching_finished_at timestamptz,

add column if not exists allocation_started_at timestamptz,
add column if not exists allocation_finished_at timestamptz,

add column if not exists completed_at timestamptz,
add column if not exists failed_at timestamptz,

add column if not exists last_error text,
add column if not exists version int default 0;


-- =========================
-- 2. step runs table
-- =========================

create table if not exists import_job_step_runs (
  id uuid primary key default gen_random_uuid(),

  import_job_id uuid not null,
  company_id uuid not null,

  step text not null, -- parse | match | allocate

  status text not null, -- started | completed | failed

  run_token text not null,
  idempotency_key text,

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  error text,

  created_at timestamptz not null default now()
);

create index if not exists idx_step_runs_job
on import_job_step_runs(import_job_id);

create index if not exists idx_step_runs_token
on import_job_step_runs(run_token);


-- =========================
-- 3. event log
-- =========================

create table if not exists import_job_events (
  id uuid primary key default gen_random_uuid(),

  import_job_id uuid not null,
  company_id uuid not null,

  type text not null, -- parse_started, parse_completed, etc

  payload jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_import_job_events_job
on import_job_events(import_job_id);


-- =========================
-- 4. guard constraint (optional)
-- =========================

-- tillåter bara en aktiv run_token per job
-- (soft lock via app + denna hjälper consistency)

create unique index if not exists idx_import_job_active_run
on import_jobs(id, active_run_token)
where active_run_token is not null;