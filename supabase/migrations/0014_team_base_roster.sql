-- =====================================================================
-- FC Crossbar - 0014_team_base_roster.sql
--
-- 팀을 시즌과 무관하게 구성하고 설정할 수 있게 한다.
--
-- 0011 의 team_members 는 시즌 종속이다 (season_id + season_team_id).
-- 그것만 있으면 시즌을 만들지 않은 상태에서는 팀에 멤버를 넣을 수 없고,
-- 친선경기처럼 시즌 밖 일정에서 팀을 쓸 수도 없다.
-- 그래서 시즌과 무관한 '기본 명단' 을 따로 둔다.
--
--   teams              팀 자체 (0011). 시즌과 무관하게 존재한다
--   team_base_members   기본 명단 (이 파일). 시즌과 무관
--   team_members        시즌별 명단 (0011). 그 시즌 그 팀의 스냅샷
--
-- 시즌을 열 때 기본 명단을 시즌 명단으로 불러와 조정하는 흐름을 의도한 것이다.
-- 그래서 기본 명단을 고쳐도 지난 시즌 기록의 소속은 바뀌지 않는다.
--
-- 재실행해도 안전하다. 0011 을 먼저 실행해야 한다 (teams 를 참조).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 팀 설정용 메모 (0011 의 teams 에 추가)
-- ---------------------------------------------------------------------
alter table public.teams add column if not exists memo text;

-- ---------------------------------------------------------------------
-- 2. 기본 명단
--    한 사람이 여러 팀의 기본 명단에 들어갈 수 있다 (UNIQUE 는 쌍에만 걸었다).
--    막지 않는 이유: 게스트나 임시 편성처럼 겹치는 경우가 실제로 생긴다.
--    대신 화면에서 '다른 팀에도 있음' 을 보여준다.
-- ---------------------------------------------------------------------
create table if not exists public.team_base_members (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id)    on delete cascade,
  member_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, member_id)
);

create index if not exists idx_team_base_members_team   on public.team_base_members (team_id);
create index if not exists idx_team_base_members_member on public.team_base_members (member_id);

-- ---------------------------------------------------------------------
-- 3. RLS — 조회는 활성 회원 전체(본인 팀을 봐야 한다), 쓰기는 관리자
-- ---------------------------------------------------------------------
alter table public.team_base_members enable row level security;

drop policy if exists team_base_members_select on public.team_base_members;
create policy team_base_members_select on public.team_base_members
  for select to authenticated
  using (public.current_profile_id() is not null);

drop policy if exists team_base_members_write_admin on public.team_base_members;
create policy team_base_members_write_admin on public.team_base_members
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.team_base_members to authenticated;
revoke all on public.team_base_members from anon;

-- ---------------------------------------------------------------------
-- 4. 명단이 붙은 팀 목록
--    화면에서 팀마다 인원수를 세려고 team_base_members 를 다시 조회하지 않도록
--    집계를 한 번에 돌려준다. SECURITY INVOKER(기본) 이라 RLS 가 그대로 걸린다.
-- ---------------------------------------------------------------------
create or replace function public.get_teams_with_base_roster()
returns table (
  id           uuid,
  name         text,
  color        text,
  memo         text,
  sort_order   integer,
  is_active    boolean,
  member_count integer
)
language sql
stable
as $$
  select t.id,
         t.name,
         t.color,
         t.memo,
         t.sort_order,
         t.is_active,
         (select count(*)::int
            from public.team_base_members bm
            join public.profiles p on p.id = bm.member_id
                                  and p.status = 'active'
                                  and p.role <> 'super_admin'
           where bm.team_id = t.id) as member_count
  from   public.teams t
  order  by t.sort_order, t.name;
$$;

revoke execute on function public.get_teams_with_base_roster() from public;
grant  execute on function public.get_teams_with_base_roster() to authenticated;

-- 확인
-- select * from public.get_teams_with_base_roster();
