-- Generate Statements smoke-test seed
-- -----------------------------------
-- Purpose:
--   Seed a deterministic dataset for statement generation QA.
--
-- Before running:
--   1) Replace all placeholder UUIDs in the params CTE.
--   2) Ensure referenced company/parties/works/import_job/allocation_run exist.
--
-- Expected output for period 2026-01-01 .. 2026-01-31:
--   - 4 statements:
--       P1 + SEK => 1000
--       P2 + SEK => 500
--       P1 + EUR => 300
--       P3 + EUR => 450
--   - 2250 total statement amount
--
-- Notes:
--   - This script inserts import_rows + allocation_lines only.
--   - Statement generation is performed via app action/UI.

begin;

with params as (
  select
    '<COMPANY_ID>'::uuid as company_id,
    '<IMPORT_JOB_ID>'::uuid as import_job_id,
    '<ALLOCATION_RUN_ID>'::uuid as allocation_run_id,
    '<PARTY_1_ID>'::uuid as party_1_id,
    '<PARTY_2_ID>'::uuid as party_2_id,
    '<PARTY_3_ID>'::uuid as party_3_id,
    '<WORK_1_ID>'::uuid as work_1_id,
    '<WORK_2_ID>'::uuid as work_2_id,
    '<WORK_3_ID>'::uuid as work_3_id,
    '<WORK_4_ID>'::uuid as work_4_id
),
seed_rows as (
  select *
  from (
    values
      -- row_id, line_id, row_number, statement_date, allocation_status, status, party_slot, work_slot, currency, allocated_amount
      ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000001a1'::uuid, 1, '2026-01-05'::date, 'allocated', 'matched', 1, 1, 'SEK', 400.00),
      ('00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0000-0000000001a2'::uuid, 2, '2026-01-10'::date, 'allocated', 'matched', 1, 1, 'SEK', 100.00),
      ('00000000-0000-0000-0000-0000000000a3'::uuid, '00000000-0000-0000-0000-0000000001a3'::uuid, 3, '2026-01-12'::date, 'allocated', 'matched', 1, 2, 'SEK', 500.00),
      ('00000000-0000-0000-0000-0000000000a4'::uuid, '00000000-0000-0000-0000-0000000001a4'::uuid, 4, '2026-01-15'::date, 'completed', 'matched', 2, 2, 'SEK', 200.00),
      ('00000000-0000-0000-0000-0000000000a5'::uuid, '00000000-0000-0000-0000-0000000001a5'::uuid, 5, '2026-01-20'::date, 'allocated', 'matched', 2, 3, 'SEK', 300.00),
      ('00000000-0000-0000-0000-0000000000a6'::uuid, '00000000-0000-0000-0000-0000000001a6'::uuid, 6, '2026-01-22'::date, 'allocated', 'matched', 1, 1, 'EUR', 120.00),
      ('00000000-0000-0000-0000-0000000000a7'::uuid, '00000000-0000-0000-0000-0000000001a7'::uuid, 7, '2026-01-25'::date, 'completed', 'matched', 1, 4, 'EUR', 180.00),
      ('00000000-0000-0000-0000-0000000000a8'::uuid, '00000000-0000-0000-0000-0000000001a8'::uuid, 8, '2026-01-26'::date, 'allocated', 'matched', 3, 4, 'EUR', 250.00),
      ('00000000-0000-0000-0000-0000000000a9'::uuid, '00000000-0000-0000-0000-0000000001a9'::uuid, 9, '2026-01-27'::date, 'completed', 'matched', 3, 4, 'EUR', 200.00),
      -- outside period (should be ignored by generation for Jan period)
      ('00000000-0000-0000-0000-0000000000aa'::uuid, '00000000-0000-0000-0000-0000000001aa'::uuid, 10, '2026-02-01'::date, 'allocated', 'matched', 1, 1, 'SEK', 999.00)
  ) as t(
    import_row_id,
    allocation_line_id,
    row_number,
    statement_date,
    allocation_status,
    row_status,
    party_slot,
    work_slot,
    currency,
    allocated_amount
  )
)
-- Cleanup previous seed rows first (idempotent re-run)
delete from allocation_lines
where id in (select allocation_line_id from seed_rows);

with seed_rows as (
  select *
  from (
    values
      ('00000000-0000-0000-0000-0000000000a1'::uuid),
      ('00000000-0000-0000-0000-0000000000a2'::uuid),
      ('00000000-0000-0000-0000-0000000000a3'::uuid),
      ('00000000-0000-0000-0000-0000000000a4'::uuid),
      ('00000000-0000-0000-0000-0000000000a5'::uuid),
      ('00000000-0000-0000-0000-0000000000a6'::uuid),
      ('00000000-0000-0000-0000-0000000000a7'::uuid),
      ('00000000-0000-0000-0000-0000000000a8'::uuid),
      ('00000000-0000-0000-0000-0000000000a9'::uuid),
      ('00000000-0000-0000-0000-0000000000aa'::uuid)
  ) as t(import_row_id)
)
delete from import_rows
where id in (select import_row_id from seed_rows);

with params as (
  select
    '<COMPANY_ID>'::uuid as company_id,
    '<IMPORT_JOB_ID>'::uuid as import_job_id,
    '<ALLOCATION_RUN_ID>'::uuid as allocation_run_id,
    '<PARTY_1_ID>'::uuid as party_1_id,
    '<PARTY_2_ID>'::uuid as party_2_id,
    '<PARTY_3_ID>'::uuid as party_3_id,
    '<WORK_1_ID>'::uuid as work_1_id,
    '<WORK_2_ID>'::uuid as work_2_id,
    '<WORK_3_ID>'::uuid as work_3_id,
    '<WORK_4_ID>'::uuid as work_4_id
),
seed_rows as (
  select *
  from (
    values
      ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000001a1'::uuid, 1, '2026-01-05'::date, 'allocated', 'matched', 1, 1, 'SEK', 400.00),
      ('00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0000-0000000001a2'::uuid, 2, '2026-01-10'::date, 'allocated', 'matched', 1, 1, 'SEK', 100.00),
      ('00000000-0000-0000-0000-0000000000a3'::uuid, '00000000-0000-0000-0000-0000000001a3'::uuid, 3, '2026-01-12'::date, 'allocated', 'matched', 1, 2, 'SEK', 500.00),
      ('00000000-0000-0000-0000-0000000000a4'::uuid, '00000000-0000-0000-0000-0000000001a4'::uuid, 4, '2026-01-15'::date, 'completed', 'matched', 2, 2, 'SEK', 200.00),
      ('00000000-0000-0000-0000-0000000000a5'::uuid, '00000000-0000-0000-0000-0000000001a5'::uuid, 5, '2026-01-20'::date, 'allocated', 'matched', 2, 3, 'SEK', 300.00),
      ('00000000-0000-0000-0000-0000000000a6'::uuid, '00000000-0000-0000-0000-0000000001a6'::uuid, 6, '2026-01-22'::date, 'allocated', 'matched', 1, 1, 'EUR', 120.00),
      ('00000000-0000-0000-0000-0000000000a7'::uuid, '00000000-0000-0000-0000-0000000001a7'::uuid, 7, '2026-01-25'::date, 'completed', 'matched', 1, 4, 'EUR', 180.00),
      ('00000000-0000-0000-0000-0000000000a8'::uuid, '00000000-0000-0000-0000-0000000001a8'::uuid, 8, '2026-01-26'::date, 'allocated', 'matched', 3, 4, 'EUR', 250.00),
      ('00000000-0000-0000-0000-0000000000a9'::uuid, '00000000-0000-0000-0000-0000000001a9'::uuid, 9, '2026-01-27'::date, 'completed', 'matched', 3, 4, 'EUR', 200.00),
      ('00000000-0000-0000-0000-0000000000aa'::uuid, '00000000-0000-0000-0000-0000000001aa'::uuid, 10, '2026-02-01'::date, 'allocated', 'matched', 1, 1, 'SEK', 999.00)
  ) as t(
    import_row_id,
    allocation_line_id,
    row_number,
    statement_date,
    allocation_status,
    row_status,
    party_slot,
    work_slot,
    currency,
    allocated_amount
  )
),
resolved as (
  select
    s.import_row_id,
    s.allocation_line_id,
    s.row_number,
    s.statement_date,
    s.allocation_status,
    s.row_status,
    case s.party_slot
      when 1 then p.party_1_id
      when 2 then p.party_2_id
      else p.party_3_id
    end as party_id,
    case s.work_slot
      when 1 then p.work_1_id
      when 2 then p.work_2_id
      when 3 then p.work_3_id
      else p.work_4_id
    end as work_id,
    s.currency,
    s.allocated_amount::numeric as allocated_amount,
    p.company_id,
    p.import_job_id,
    p.allocation_run_id
  from seed_rows s
  cross join params p
),
inserted_rows as (
  insert into import_rows (
    id,
    company_id,
    import_id,
    import_job_id,
    row_number,
    status,
    allocation_status,
    matched_work_id,
    currency,
    net_amount,
    gross_amount,
    canonical,
    normalized,
    raw,
    created_at,
    updated_at
  )
  select
    r.import_row_id,
    r.company_id,
    r.import_job_id,
    r.import_job_id,
    r.row_number,
    r.row_status,
    r.allocation_status,
    r.work_id,
    r.currency,
    r.allocated_amount,
    r.allocated_amount,
    jsonb_build_object('statement_date', to_char(r.statement_date, 'YYYY-MM-DD')),
    jsonb_build_object('statement_date', to_char(r.statement_date, 'YYYY-MM-DD')),
    jsonb_build_object('statement_date', to_char(r.statement_date, 'YYYY-MM-DD')),
    now(),
    now()
  from resolved r
  returning id
)
insert into allocation_lines (
  id,
  allocation_run_id,
  company_id,
  import_job_id,
  import_row_id,
  work_id,
  party_id,
  role,
  source_split_id,
  row_amount,
  share_bps,
  allocated_amount,
  currency
)
select
  r.allocation_line_id,
  r.allocation_run_id,
  r.company_id,
  r.import_job_id,
  r.import_row_id,
  r.work_id,
  r.party_id,
  null,
  null,
  r.allocated_amount,
  10000,
  r.allocated_amount,
  r.currency
from resolved r;

commit;

-- ------------------------------------------------------------
-- Pre-generation sanity (source rows in Jan)
-- ------------------------------------------------------------
-- select
--   party_id,
--   currency,
--   count(*) as row_count,
--   sum(allocated_amount) as total_amount
-- from allocation_lines al
-- join import_rows ir on ir.id = al.import_row_id
-- where al.company_id = '<COMPANY_ID>'::uuid
--   and (ir.canonical->>'statement_date') between '2026-01-01' and '2026-01-31'
--   and ir.allocation_status in ('allocated', 'completed')
-- group by party_id, currency
-- order by party_id, currency;

-- ------------------------------------------------------------
-- Post-generation checks (after running Generate Statements UI)
-- ------------------------------------------------------------
-- select count(*) as statements_count,
--        coalesce(sum(total_amount), 0) as statements_total
-- from statements
-- where company_id = '<COMPANY_ID>'::uuid
--   and period_start = '2026-01-01'
--   and period_end = '2026-01-31'
--   and status = 'draft'
--   and generated_from = 'allocation';

-- select coalesce(sum(sl.amount), 0) as lines_total
-- from statement_lines sl
-- join statements s on s.id = sl.statement_id
-- where s.company_id = '<COMPANY_ID>'::uuid
--   and s.period_start = '2026-01-01'
--   and s.period_end = '2026-01-31'
--   and s.status = 'draft'
--   and s.generated_from = 'allocation';

-- select coalesce(sum(l.amount), 0) as ledger_total
-- from statement_ledger l
-- join statements s on s.id = l.statement_id
-- where s.company_id = '<COMPANY_ID>'::uuid
--   and s.period_start = '2026-01-01'
--   and s.period_end = '2026-01-31'
--   and s.status = 'draft'
--   and s.generated_from = 'allocation';
