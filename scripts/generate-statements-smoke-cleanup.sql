-- Generate Statements smoke-test cleanup
-- --------------------------------------
-- Purpose:
--   Remove data created by scripts/generate-statements-smoke-seed.sql
--   and statements generated from that seed.
--
-- Before running:
--   1) Replace <COMPANY_ID> and <IMPORT_JOB_ID>.
--   2) Keep date window/source as-is unless you intentionally changed the smoke test.
--
-- Safety:
--   - Deletes are scoped to:
--       company_id
--       period_start/period_end
--       generated_from = 'allocation'
--       and seed import_row ids / allocation_line ids

begin;

with seed_import_rows as (
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
  ) as t(id)
),
seed_allocation_lines as (
  select *
  from (
    values
      ('00000000-0000-0000-0000-0000000001a1'::uuid),
      ('00000000-0000-0000-0000-0000000001a2'::uuid),
      ('00000000-0000-0000-0000-0000000001a3'::uuid),
      ('00000000-0000-0000-0000-0000000001a4'::uuid),
      ('00000000-0000-0000-0000-0000000001a5'::uuid),
      ('00000000-0000-0000-0000-0000000001a6'::uuid),
      ('00000000-0000-0000-0000-0000000001a7'::uuid),
      ('00000000-0000-0000-0000-0000000001a8'::uuid),
      ('00000000-0000-0000-0000-0000000001a9'::uuid),
      ('00000000-0000-0000-0000-0000000001aa'::uuid)
  ) as t(id)
),
seed_statements as (
  select s.id
  from statements s
  where s.company_id = '<COMPANY_ID>'::uuid
    and s.period_start = '2026-01-01'
    and s.period_end = '2026-01-31'
    and s.status = 'draft'
    and s.generated_from = 'allocation'
)
delete from statement_ledger
where statement_id in (select id from seed_statements);

with seed_statements as (
  select s.id
  from statements s
  where s.company_id = '<COMPANY_ID>'::uuid
    and s.period_start = '2026-01-01'
    and s.period_end = '2026-01-31'
    and s.status = 'draft'
    and s.generated_from = 'allocation'
)
delete from statement_lines
where statement_id in (select id from seed_statements);

delete from statements
where company_id = '<COMPANY_ID>'::uuid
  and period_start = '2026-01-01'
  and period_end = '2026-01-31'
  and status = 'draft'
  and generated_from = 'allocation';

delete from allocation_lines
where id in (select id from seed_allocation_lines);

delete from import_rows
where id in (select id from seed_import_rows)
  and company_id = '<COMPANY_ID>'::uuid
  and import_job_id = '<IMPORT_JOB_ID>'::uuid;

commit;

-- Optional check:
-- select count(*) from statements
-- where company_id = '<COMPANY_ID>'::uuid
--   and period_start = '2026-01-01'
--   and period_end = '2026-01-31'
--   and generated_from = 'allocation';
