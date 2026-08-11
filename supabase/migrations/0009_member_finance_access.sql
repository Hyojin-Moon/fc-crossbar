-- =====================================================================
-- FC Crossbar - 0009_member_finance_access.sql
--
-- 1) 일반회원도 회비를 볼 수 있게 한다 (읽기 전용)
--      - 팀 잔액 · 이번 달 입금/지출 : 전원 공개
--      - 지출 내역                  : 전원 공개 (읽기만)
--      - 납부 상황                  : 본인 것만. 남의 미납 사실은 운영진만 본다
-- 2) super_admin(개발/운영 계정)은 팀 명부에서 제외한다
--      일정 · 통계 · 회비에 팀원처럼 섞이면 인원수와 참석률이 오염된다
--
-- 재실행해도 안전하다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 지출 내역 — 조회는 전원, 쓰기는 관리자
-- ---------------------------------------------------------------------
drop policy if exists expenses_all_admin on public.expenses;

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select to authenticated
  using (public.current_profile_id() is not null);

drop policy if exists expenses_write_admin on public.expenses;
create policy expenses_write_admin on public.expenses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. 회비 납부 — 본인 것 또는 관리자. 쓰기는 관리자
-- ---------------------------------------------------------------------
drop policy if exists payments_all_admin on public.membership_payments;

drop policy if exists payments_select on public.membership_payments;
create policy payments_select on public.membership_payments
  for select to authenticated
  using (public.is_admin() or member_id = public.current_profile_id());

drop policy if exists payments_write_admin on public.membership_payments;
create policy payments_write_admin on public.membership_payments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. 회비 요약
--    일반회원은 본인 납부만 볼 수 있어서 클라이언트에서 잔액을 더할 수 없다.
--    개인별 정보는 주지 않고 '합계만' 돌려주는 함수를 둔다.
--    SECURITY DEFINER 로 RLS 를 우회하지만 반환값이 집계뿐이라 안전하다.
--
--    super_admin 의 회비는 집계에서 제외한다 (팀원이 아닌 운영 계정).
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
  pay as (
    select p.amount, p.status, p.year, p.month
    from   public.membership_payments p
    join   public.profiles pr on pr.id = p.member_id and pr.role <> 'super_admin'
  ),
  exp as (select e.amount, e.expense_date from public.expenses e)
  select
    coalesce((select sum(pay.amount) from pay where pay.status = 'paid'), 0),
    coalesce((select sum(exp.amount) from exp), 0),
    coalesce((select sum(pay.amount) from pay where pay.status = 'paid'), 0)
      - coalesce((select sum(exp.amount) from exp), 0),
    coalesce((select sum(pay.amount) from pay, y
               where pay.status = 'paid' and pay.year = y.yy and pay.month = y.mm), 0),
    coalesce((select sum(exp.amount) from exp, y
               where extract(year from exp.expense_date)::int = y.yy
                 and extract(month from exp.expense_date)::int = y.mm), 0),
    (select count(*)::int from pay, y
       where pay.status = 'unpaid' and pay.year = y.yy and pay.month = y.mm);
$$;

revoke execute on function public.get_finance_summary(integer, integer) from public;
grant  execute on function public.get_finance_summary(integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 4. 참석률 통계에서 super_admin 제외
--    (반환 컬럼은 그대로라 create or replace 로 충분하다)
-- ---------------------------------------------------------------------
create or replace function public.get_attendance_stats(
  from_date date default null,
  to_date   date default null
)
returns table (
  member_id          uuid,
  name               text,
  present_count      integer,
  late_count         integer,
  absent_count       integer,
  no_show_count      integer,
  recorded_events    integer,
  attendance_rate    numeric,
  attend_vote_count  integer,
  voted_count        integer,
  vote_target_events integer,
  vote_response_rate numeric
)
language sql
stable
as $$
  with target as (
    select e.id,
           exists (select 1 from public.event_attendance a where a.event_id = e.id) as has_attendance
    from   public.events e
    where  e.include_attendance_stats
      and  e.status <> 'cancelled'
      and  e.event_date <= current_date
      and  (from_date is null or e.event_date >= from_date)
      and  (to_date   is null or e.event_date <= to_date)
  ),
  recorded as (select target.id from target where target.has_attendance),
  att as (
    select a.member_id,
           count(*) filter (where a.status = 'present') as present,
           count(*) filter (where a.status = 'late')    as late,
           count(*) filter (where a.status = 'absent')  as absent,
           count(*) filter (where a.status = 'no_show') as no_show
    from   public.event_attendance a
    where  a.event_id in (select recorded.id from recorded)
    group  by a.member_id
  ),
  vt as (
    select v.member_id,
           count(*)                                       as voted,
           count(*) filter (where vo.counts_as_attendance) as attend_votes
    from   public.event_votes v
    join   public.vote_options vo on vo.code = v.vote
    where  v.event_id in (select target.id from target)
    group  by v.member_id
  ),
  n as (
    select (select count(*) from recorded)::int as rec_n,
           (select count(*) from target)::int   as tgt_n
  )
  select
    p.id,
    p.name,
    coalesce(att.present, 0)::int,
    coalesce(att.late,    0)::int,
    coalesce(att.absent,  0)::int,
    coalesce(att.no_show, 0)::int,
    n.rec_n,
    case when n.rec_n = 0 then 0
         else round((coalesce(att.present, 0) + coalesce(att.late, 0)) * 100.0 / n.rec_n, 1)
    end,
    coalesce(vt.attend_votes, 0)::int,
    coalesce(vt.voted,        0)::int,
    n.tgt_n,
    case when n.tgt_n = 0 then 0
         else round(coalesce(vt.voted, 0) * 100.0 / n.tgt_n, 1)
    end
  from      public.profiles p
  cross join n
  left join att on att.member_id = p.id
  left join vt  on vt.member_id  = p.id
  where     p.status = 'active'
    -- 운영 계정은 팀 명부가 아니다
    and     p.role <> 'super_admin'
  order by  8 desc, p.name;
$$;

revoke execute on function public.get_attendance_stats(date, date) from public;
grant  execute on function public.get_attendance_stats(date, date) to authenticated;

-- 확인
-- select * from public.get_finance_summary();
-- select name, attendance_rate from public.get_attendance_stats(null, null);
