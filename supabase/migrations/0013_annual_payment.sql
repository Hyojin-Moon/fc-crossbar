-- =====================================================================
-- FC Crossbar - 0013_annual_payment.sql
--
-- 회비 연납: 월 3만원인데 연초에 한 번에 내면 30만원으로 할인.
--
-- membership_payments 는 (member_id, year, month) 가 NOT NULL 이고 UNIQUE 라서
-- 연납을 여기에 끼워 넣을 수 없다. 별도 테이블로 둔다.
--
-- ★ 같이 바뀌어야 하는 것 — 안 바꾸면 숫자가 거짓말을 한다:
--    1) 수입 합계에 연납이 더해져야 한다
--    2) 연납한 회원은 매달 '미납' 으로 세어지면 안 된다
--    3) 납부 화면에서 그 회원은 월별 토글이 아니라 '연납' 으로 보여야 한다 (앱에서 처리)
--
-- 재실행해도 안전하다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 연납 내역
-- ---------------------------------------------------------------------
create table if not exists public.membership_annual_payments (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.profiles(id) on delete cascade,
  year         integer not null check (year between 2000 and 2100),
  amount       integer not null check (amount >= 0),
  payment_date date,
  memo         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (member_id, year)
);

create index if not exists idx_annual_member on public.membership_annual_payments (member_id);
create index if not exists idx_annual_year   on public.membership_annual_payments (year);

drop trigger if exists trg_touch_updated_at on public.membership_annual_payments;
create trigger trg_touch_updated_at before update on public.membership_annual_payments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. RLS — membership_payments 와 같은 기준.
--    본인 것 또는 관리자만 조회. 쓰기는 관리자.
-- ---------------------------------------------------------------------
alter table public.membership_annual_payments enable row level security;

drop policy if exists annual_select on public.membership_annual_payments;
create policy annual_select on public.membership_annual_payments
  for select to authenticated
  using (public.is_admin() or member_id = public.current_profile_id());

drop policy if exists annual_write_admin on public.membership_annual_payments;
create policy annual_write_admin on public.membership_annual_payments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.membership_annual_payments to authenticated;
revoke all on public.membership_annual_payments from anon;

-- ---------------------------------------------------------------------
-- 3. 기본 금액 설정
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value) values ('annual_fee_amount', '300000'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 4. 회비 요약에 연납 반영
--    - 수입: 월납(paid) + 연납 전체
--    - 이번 달 입금: 연납은 payment_date 가 그 달인 것만
--    - 미납 인원: 그 해 연납 기록이 있는 회원은 제외
-- ---------------------------------------------------------------------
create or replace function public.get_finance_summary(
  p_year  integer default null,
  p_month integer default null
)
returns table (
  total_income  bigint,
  total_expense bigint,
  balance       bigint,
  month_income  bigint,
  month_expense bigint,
  unpaid_count  integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with y as (select coalesce(p_year,  extract(year  from current_date)::int) as yy,
                    coalesce(p_month, extract(month from current_date)::int) as mm),
  -- super_admin 은 팀원이 아니므로 집계에서 뺀다
  pay as (
    select p.member_id, p.amount, p.status, p.year, p.month
    from   public.membership_payments p
    join   public.profiles pr on pr.id = p.member_id and pr.role <> 'super_admin'
  ),
  ann as (
    select a.member_id, a.amount, a.year, a.payment_date
    from   public.membership_annual_payments a
    join   public.profiles pr on pr.id = a.member_id and pr.role <> 'super_admin'
  ),
  exp as (select e.amount, e.expense_date from public.expenses e),
  income as (
    select coalesce((select sum(pay.amount) from pay where pay.status = 'paid'), 0)
         + coalesce((select sum(ann.amount) from ann), 0) as total
  ),
  spent as (select coalesce((select sum(exp.amount) from exp), 0) as total)
  select
    (select income.total from income),
    (select spent.total from spent),
    (select income.total from income) - (select spent.total from spent),
    coalesce((select sum(pay.amount) from pay, y
               where pay.status = 'paid' and pay.year = y.yy and pay.month = y.mm), 0)
      + coalesce((select sum(ann.amount) from ann, y
                   where ann.payment_date is not null
                     and extract(year  from ann.payment_date)::int = y.yy
                     and extract(month from ann.payment_date)::int = y.mm), 0),
    coalesce((select sum(exp.amount) from exp, y
               where extract(year from exp.expense_date)::int = y.yy
                 and extract(month from exp.expense_date)::int = y.mm), 0),
    (select count(*)::int from pay, y
       where pay.status = 'unpaid'
         and pay.year = y.yy and pay.month = y.mm
         -- 그 해 연납한 회원은 미납이 아니다
         and not exists (select 1 from ann
                          where ann.member_id = pay.member_id and ann.year = y.yy));
$$;

revoke execute on function public.get_finance_summary(integer, integer) from public;
grant  execute on function public.get_finance_summary(integer, integer) to authenticated;

-- 확인
-- select * from public.get_finance_summary();
-- select p.name, a.year, a.amount, a.payment_date
-- from public.membership_annual_payments a join public.profiles p on p.id = a.member_id;
