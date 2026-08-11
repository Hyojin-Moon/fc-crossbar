-- =====================================================================
-- FC Crossbar - 0012_match_stats.sql
--
-- 경기 결과(스코어는 0011 에서 events 에 넣었다)와 개인 스탯.
--
-- 스탯 항목은 컬럼이 아니라 테이블(stat_types)로 둔다. vote_options 와 같은 방식이다.
-- 새 항목이 필요하면 row 만 추가하면 되고 스키마·앱을 고치지 않는다.
--
-- 재실행해도 안전하다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 스탯 항목
-- ---------------------------------------------------------------------
create table if not exists public.stat_types (
  code       text primary key,
  label      text not null,
  -- 값을 여러 번 셀 수 있는 항목인가 (득점=여러 개, MOM=한 번)
  is_countable boolean not null default true,
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

insert into public.stat_types (code, label, is_countable, sort_order, is_active) values
  ('goal',        '득점',     true,  1, true),
  ('assist',      '도움',     true,  2, true),
  ('own_goal',    '자책골',   true,  3, true),
  ('yellow_card', '경고',     true,  4, true),
  ('red_card',    '퇴장',     true,  5, true),
  ('mom',         'MOM',      false, 6, true),
  ('clean_sheet', '클린시트', false, 7, false),
  ('save',        '세이브',   true,  8, false)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 2. 개인 스탯 — 경기 × 회원 × 항목
-- ---------------------------------------------------------------------
create table if not exists public.member_match_stats (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)         on delete cascade,
  member_id   uuid not null references public.profiles(id)       on delete cascade,
  stat_type   text not null references public.stat_types(code),
  value       integer not null default 1 check (value > 0),
  memo        text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, member_id, stat_type)
);

create index if not exists idx_stats_event  on public.member_match_stats (event_id);
create index if not exists idx_stats_member on public.member_match_stats (member_id);

drop trigger if exists trg_touch_updated_at on public.member_match_stats;
create trigger trg_touch_updated_at before update on public.member_match_stats
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. RLS — 조회는 활성 회원 전체(공개 통계), 쓰기는 관리자
-- ---------------------------------------------------------------------
alter table public.stat_types         enable row level security;
alter table public.member_match_stats enable row level security;

drop policy if exists stat_types_select on public.stat_types;
create policy stat_types_select on public.stat_types
  for select to authenticated using (true);

drop policy if exists stat_types_write_admin on public.stat_types;
create policy stat_types_write_admin on public.stat_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists stats_select on public.member_match_stats;
create policy stats_select on public.member_match_stats
  for select to authenticated using (public.current_profile_id() is not null);

drop policy if exists stats_write_admin on public.member_match_stats;
create policy stats_write_admin on public.member_match_stats
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.stat_types         to authenticated;
grant select, insert, update, delete on public.member_match_stats to authenticated;
revoke all on public.stat_types, public.member_match_stats from anon;

-- ---------------------------------------------------------------------
-- 4. 개인 스탯 집계
--    항목이 데이터라서 컬럼으로 펼칠 수 없다. 긴 형태로 돌려주고 화면에서 가로로 펼친다.
--    p_season_id 를 주면 그 시즌 경기만, 날짜를 주면 그 기간만 센다.
-- ---------------------------------------------------------------------
create or replace function public.get_member_stat_totals(
  from_date    date default null,
  to_date      date default null,
  p_season_id  uuid default null
)
returns table (
  member_id uuid,
  name      text,
  stat_type text,
  total     integer
)
language sql
stable
as $$
  with target as (
    select e.id
    from   public.events e
    where  e.status <> 'cancelled'
      and  e.event_date <= current_date
      and  (from_date   is null or e.event_date >= from_date)
      and  (to_date     is null or e.event_date <= to_date)
      and  (p_season_id is null or e.season_id  = p_season_id)
  )
  select s.member_id,
         p.name,
         s.stat_type,
         sum(s.value)::int
  from   public.member_match_stats s
  join   public.profiles p on p.id = s.member_id and p.role <> 'super_admin'
  where  s.event_id in (select target.id from target)
  group  by s.member_id, p.name, s.stat_type;
$$;

revoke execute on function public.get_member_stat_totals(date, date, uuid) from public;
grant  execute on function public.get_member_stat_totals(date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. 시즌 순위
--    스코어가 입력된 경기만 센다. 승 3점 · 무 1점.
--    홈/원정 두 관점을 union 으로 펼친 뒤 팀별로 집계한다.
-- ---------------------------------------------------------------------
create or replace function public.get_season_standings(p_season_id uuid)
returns table (
  team_id       uuid,
  team_name     text,
  played        integer,
  win           integer,
  draw          integer,
  loss          integer,
  goals_for     integer,
  goals_against integer,
  goal_diff     integer,
  points        integer
)
language sql
stable
as $$
  with m as (
    select e.home_team_id, e.away_team_id, e.home_score, e.away_score
    from   public.events e
    where  e.season_id  = p_season_id
      and  e.match_type = 'season'
      and  e.status <> 'cancelled'
      and  e.home_score is not null
  ),
  sides as (
    select m.home_team_id as team_id, m.home_score as gf, m.away_score as ga from m
    union all
    select m.away_team_id,            m.away_score,       m.home_score       from m
  )
  select t.id,
         t.name,
         count(sides.team_id)::int,
         count(*) filter (where sides.gf >  sides.ga)::int,
         count(*) filter (where sides.gf =  sides.ga)::int,
         count(*) filter (where sides.gf <  sides.ga)::int,
         coalesce(sum(sides.gf), 0)::int,
         coalesce(sum(sides.ga), 0)::int,
         (coalesce(sum(sides.gf), 0) - coalesce(sum(sides.ga), 0))::int,
         (count(*) filter (where sides.gf > sides.ga) * 3
          + count(*) filter (where sides.gf = sides.ga))::int
  from      public.season_teams st
  join      public.teams t on t.id = st.team_id
  left join sides on sides.team_id = t.id
  where     st.season_id = p_season_id
  group by  t.id, t.name
  order by  10 desc, 9 desc, 7 desc, t.name;
$$;

revoke execute on function public.get_season_standings(uuid) from public;
grant  execute on function public.get_season_standings(uuid) to authenticated;

-- 확인
-- select * from public.get_season_standings('<season-uuid>');
-- select name, stat_type, total from public.get_member_stat_totals(null, null, null) order by name;
