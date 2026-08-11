-- =====================================================================
-- FC Crossbar - 0008_event_attendance.sql
--
-- 투표(사전 의사)와 실제 출석(사후 기록)을 분리한다.
--
-- 왜 event_votes 에 '지각'·'노쇼'를 끼워 넣지 않는가:
--   - 노쇼는 "참석한다고 투표했는데 안 온" 것이다. 투표 값을 덮어쓰면 그 신호가 사라진다.
--   - 투표를 안 했는데 나온 사람도 출석으로 기록해야 한다.
--   - 투표는 회원 본인이, 출석은 운영진이 기록한다. 권한 주체가 다르다.
--
-- 참석률은 이제 실제 출석 기준이다.
--   참석률 = (참석 + 지각) / 출석 체크가 끝난 경기 수
-- 출석 기록이 하나도 없는 경기는 분모에서 빠진다. 아직 체크하지 않은 경기 때문에
-- 전원 참석률이 깎이면 숫자를 신뢰할 수 없기 때문이다.
--
-- 재실행해도 안전하다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. event_attendance
-- ---------------------------------------------------------------------
create table if not exists public.event_attendance (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)   on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  status      text not null check (status in ('present', 'late', 'absent', 'no_show')),
  memo        text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, member_id)
);

create index if not exists idx_attendance_event_id  on public.event_attendance (event_id);
create index if not exists idx_attendance_member_id on public.event_attendance (member_id);

drop trigger if exists trg_touch_updated_at on public.event_attendance;
create trigger trg_touch_updated_at before update on public.event_attendance
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. RLS — 조회는 활성 회원 전체(참석률이 공개 통계라서), 쓰기는 관리자
-- ---------------------------------------------------------------------
alter table public.event_attendance enable row level security;

drop policy if exists attendance_select on public.event_attendance;
create policy attendance_select on public.event_attendance
  for select to authenticated
  using (public.current_profile_id() is not null);

drop policy if exists attendance_write_admin on public.event_attendance;
create policy attendance_write_admin on public.event_attendance
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.event_attendance to authenticated;
revoke all on public.event_attendance from anon;

-- ---------------------------------------------------------------------
-- 3. 투표자를 참석으로 일괄 기록
--    "투표한 인원 자동으로 참석 체크" 버튼이 호출한다.
--    ON CONFLICT DO NOTHING 이라 이미 손으로 지각·노쇼로 고친 기록은 덮어쓰지 않는다.
--    여러 번 눌러도 안전하다.
-- ---------------------------------------------------------------------
create or replace function public.admin_seed_attendance_from_votes(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted integer;
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  insert into public.event_attendance (event_id, member_id, status, recorded_by)
  select v.event_id, v.member_id, 'present', public.current_profile_id()
  from   public.event_votes v
  join   public.vote_options vo on vo.code = v.vote
  join   public.profiles p      on p.id = v.member_id and p.status = 'active'
  where  v.event_id = p_event_id
    and  vo.counts_as_attendance
  on conflict (event_id, member_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke execute on function public.admin_seed_attendance_from_votes(uuid) from public;
grant  execute on function public.admin_seed_attendance_from_votes(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. 참석률 통계 재작성
--    실제 출석 기준 참석률과 투표 응답률을 함께 돌려준다.
--    반환 컬럼이 바뀌므로 기존 함수를 먼저 지운다.
--
--    주의: 출석 집계와 투표 집계를 profiles 에 각각 LEFT JOIN 하면 두 결과가
--    카테시안 곱이 되어 개수가 부풀려진다. 그래서 회원별로 미리 집계한 뒤 붙인다.
-- ---------------------------------------------------------------------
drop function if exists public.get_attendance_stats(date, date);

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
      -- 아직 치르지 않은 경기는 집계하지 않는다
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
           count(*)                                          as voted,
           count(*) filter (where vo.counts_as_attendance)    as attend_votes
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
  order by  8 desc, p.name;
$$;

revoke execute on function public.get_attendance_stats(date, date) from public;
grant  execute on function public.get_attendance_stats(date, date) to authenticated;

-- 확인
-- select name, present_count, late_count, no_show_count, recorded_events, attendance_rate,
--        voted_count, vote_target_events, vote_response_rate
-- from public.get_attendance_stats(null, null);
