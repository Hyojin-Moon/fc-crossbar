-- =====================================================================
-- FC Crossbar - 0011_teams_seasons.sql
--
-- 클럽 안에서 2~3팀이 시즌 동안 서로 경기하는 방식을 담는다.
--
-- 소속은 시즌마다 다시 편성된다. team_members 가 season 을 함께 들고 있어야
-- "2026 상반기에 A팀이었던 기록" 이 나중에 팀을 옮겨도 그대로 남는다.
--
-- 시즌 경기는 별도 matches 테이블을 만들지 않고 events 를 확장한다.
--   - events.match_type 에 'season' 이 이미 있다
--   - 시즌 경기도 참석 투표를 받아야 하고, event_attendance 와
--     get_attendance_stats 가 모두 event_id 를 기준으로 동작한다
--   - 테이블을 나누면 출석 경로가 두 갈래로 갈라진다
--
-- 재실행해도 안전하다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 시즌
-- ---------------------------------------------------------------------
create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  start_date date not null,
  end_date   date not null,
  status     text not null default 'upcoming'
             check (status in ('upcoming', 'active', 'closed')),
  memo       text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_period_check check (end_date >= start_date)
);

create index if not exists idx_seasons_period on public.seasons (start_date desc);

-- ---------------------------------------------------------------------
-- 2. 팀
--    시즌과 독립적으로 존재한다. 'A팀' 같은 이름을 여러 시즌에 재사용한다.
-- ---------------------------------------------------------------------
create table if not exists public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  -- 조끼 색 등 화면 표시용 (#RRGGBB)
  color      text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_teams_active on public.teams (is_active, sort_order, name);

-- ---------------------------------------------------------------------
-- 3. 시즌 참가 팀
--    unique (id, season_id) 는 team_members 의 복합 FK 대상이다.
--    이걸로 "명단의 시즌과 팀의 시즌이 어긋나는" 조합을 DB 가 막는다.
-- ---------------------------------------------------------------------
create table if not exists public.season_teams (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references public.seasons(id) on delete cascade,
  team_id    uuid not null references public.teams(id)   on delete cascade,
  created_at timestamptz not null default now(),
  unique (season_id, team_id),
  unique (id, season_id)
);

create index if not exists idx_season_teams_season on public.season_teams (season_id);

-- ---------------------------------------------------------------------
-- 4. 시즌별 팀 명단
--    unique (season_id, member_id) = 한 시즌에 한 사람은 한 팀만.
-- ---------------------------------------------------------------------
create table if not exists public.team_members (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null,
  season_team_id uuid not null,
  member_id      uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (season_id, member_id),
  foreign key (season_team_id, season_id)
    references public.season_teams(id, season_id) on delete cascade
);

create index if not exists idx_team_members_season_team on public.team_members (season_team_id);
create index if not exists idx_team_members_member      on public.team_members (member_id);

-- ---------------------------------------------------------------------
-- 5. events 확장 — 시즌 경기와 결과
-- ---------------------------------------------------------------------
alter table public.events add column if not exists season_id    uuid references public.seasons(id) on delete set null;
alter table public.events add column if not exists home_team_id uuid references public.teams(id)   on delete set null;
alter table public.events add column if not exists away_team_id uuid references public.teams(id)   on delete set null;
alter table public.events add column if not exists home_score   integer;
alter table public.events add column if not exists away_score   integer;

create index if not exists idx_events_season on public.events (season_id, event_date);

-- 팀 없이 'season' 으로 만들어 둔 기존 일정은 일반경기로 내린다.
-- (팀 기능이 없던 시절에 만들 수 있었다. 아래 CHECK 를 걸기 전에 정리해야 한다)
update public.events
set    match_type = 'regular'
where  match_type = 'season'
  and  (season_id is null or home_team_id is null or away_team_id is null);

alter table public.events drop constraint if exists events_season_match_check;
alter table public.events add constraint events_season_match_check check (
  match_type <> 'season'
  or (season_id is not null
      and home_team_id is not null
      and away_team_id is not null
      and home_team_id <> away_team_id)
);

-- 점수는 둘 다 있거나 둘 다 없다. 한쪽만 있으면 집계가 틀어진다.
alter table public.events drop constraint if exists events_score_check;
alter table public.events add constraint events_score_check check (
  (home_score is null) = (away_score is null)
);

-- ---------------------------------------------------------------------
-- 6. updated_at 트리거
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['seasons', 'teams']
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
       for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 지난 시즌 명단 복사
--    시즌마다 명단을 처음부터 짜는 건 번거롭다. 같은 이름의 팀이 양쪽 시즌에
--    모두 참가하고 있을 때만 옮긴다. 이미 배정된 회원은 건드리지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.admin_copy_season_roster(
  from_season_id uuid,
  to_season_id   uuid
)
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
  if from_season_id = to_season_id then
    raise exception '같은 시즌입니다.' using errcode = '22023';
  end if;

  insert into public.team_members (season_id, season_team_id, member_id)
  select to_st.season_id, to_st.id, tm.member_id
  from   public.team_members tm
  join   public.season_teams from_st on from_st.id = tm.season_team_id
  join   public.season_teams to_st
         on to_st.season_id = to_season_id
        and to_st.team_id   = from_st.team_id
  join   public.profiles p on p.id = tm.member_id
                          and p.status = 'active'
                          and p.role <> 'super_admin'
  where  from_st.season_id = from_season_id
  on conflict (season_id, member_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke execute on function public.admin_copy_season_roster(uuid, uuid) from public;
grant  execute on function public.admin_copy_season_roster(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. RLS — 조회는 활성 회원 전체, 쓰기는 관리자
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['seasons', 'teams', 'season_teams', 'team_members']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
       using (public.current_profile_id() is not null)', t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_write_admin', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
       using (public.is_admin()) with check (public.is_admin())', t || '_write_admin', t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- 확인
-- select name, start_date, end_date, status from public.seasons order by start_date desc;
-- select s.name, t.name, count(tm.id) as 명단
-- from public.season_teams st
-- join public.seasons s on s.id = st.season_id
-- join public.teams t on t.id = st.team_id
-- left join public.team_members tm on tm.season_team_id = st.id
-- group by s.name, t.name order by s.name, t.name;
