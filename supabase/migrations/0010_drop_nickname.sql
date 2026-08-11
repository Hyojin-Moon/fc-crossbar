-- =====================================================================
-- FC Crossbar - 0010_drop_nickname.sql
--
-- 실명제로 운영하기로 해서 닉네임을 없앤다.
--
-- 순서가 중요하다:
--   1) get_attendance_stats() 가 반환 컬럼에 nickname 을 갖고 있으므로 먼저 지운다
--   2) handle_new_user() 가 nickname 을 넣으므로 먼저 고친다
--   3) 그다음 컬럼을 지운다
--   4) authenticated 롤의 컬럼 UPDATE 권한에서도 nickname 을 뺀다
--
-- 재실행해도 안전하다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 가입 트리거에서 nickname 제거
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  needs_approval boolean := false;
begin
  select coalesce((s.value #>> '{}')::boolean, false)
    into needs_approval
    from public.app_settings s
   where s.key = 'require_approval';

  insert into public.profiles (user_id, login_id, name, phone, status)
  values (
    new.id,
    case when new.email like '%@fccrossbar.local'
         then split_part(new.email, '@', 1) end,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when needs_approval then 'pending' else 'active' end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. 통계 함수 재생성 (nickname 반환 컬럼 제거)
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
    and     p.role <> 'super_admin'
  order by  8 desc, p.name;
$$;

revoke execute on function public.get_attendance_stats(date, date) from public;
grant  execute on function public.get_attendance_stats(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. 컬럼 제거
-- ---------------------------------------------------------------------
alter table public.profiles drop column if exists nickname;

-- ---------------------------------------------------------------------
-- 4. 컬럼 단위 UPDATE 권한 재설정 (nickname 제외)
--    사용자가 직접 바꿀 수 있는 값은 이름과 전화번호뿐이다.
-- ---------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant  update (name, phone) on public.profiles to authenticated;

-- 확인
-- select login_id, name, phone, role, status from public.profiles order by created_at;
-- select name, attendance_rate from public.get_attendance_stats(null, null);
