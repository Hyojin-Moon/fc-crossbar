-- =====================================================================
-- FC Crossbar - 0007_venues_and_match_type.sql
--
-- 1) 경기장을 미리 등록해 두고 일정 생성 시 골라 쓴다 (주소까지 자동 입력)
-- 2) 일정에 경기 유형(시즌 / 일반 / 기타)을 둔다
--
-- events.venue_name / venue_address 는 그대로 남긴다.
-- 경기장을 고르면 그 값을 '복사'해 넣는다 — 나중에 경기장 이름이나 주소가 바뀌어도
-- 지난 경기 기록은 당시 값을 유지해야 하기 때문이다. venue_id 는 참조용.
--
-- 재실행해도 안전하다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. venues
-- ---------------------------------------------------------------------
create table if not exists public.venues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  address    text,
  map_url    text,
  memo       text,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_venues_active on public.venues (is_active, sort_order, name);

drop trigger if exists trg_touch_updated_at on public.venues;
create trigger trg_touch_updated_at before update on public.venues
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. events 확장
-- ---------------------------------------------------------------------
alter table public.events add column if not exists venue_id uuid
  references public.venues(id) on delete set null;

alter table public.events add column if not exists match_type text not null default 'regular';

-- CHECK 은 재실행 대비로 지웠다 다시 건다
alter table public.events drop constraint if exists events_match_type_check;
alter table public.events add constraint events_match_type_check
  check (match_type in ('season', 'regular', 'etc'));

create index if not exists idx_events_match_type on public.events (match_type);

-- ---------------------------------------------------------------------
-- 3. 기존 일정에 쓰인 구장명을 venues 로 옮겨 담고 연결
-- ---------------------------------------------------------------------
insert into public.venues (name, address)
select distinct e.venue_name, max(e.venue_address)
from   public.events e
where  e.venue_name is not null and btrim(e.venue_name) <> ''
group  by e.venue_name
on conflict (name) do nothing;

update public.events e
set    venue_id = v.id
from   public.venues v
where  e.venue_id is null and e.venue_name = v.name;

-- ---------------------------------------------------------------------
-- 4. RLS — 조회는 활성 회원 전체, 쓰기는 관리자
-- ---------------------------------------------------------------------
alter table public.venues enable row level security;

drop policy if exists venues_select on public.venues;
create policy venues_select on public.venues
  for select to authenticated
  using (public.current_profile_id() is not null);

drop policy if exists venues_write_admin on public.venues;
create policy venues_write_admin on public.venues
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.venues to authenticated;
revoke all on public.venues from anon;

-- 확인
-- select name, address, is_active from public.venues order by sort_order, name;
-- select title, match_type, venue_name, venue_id from public.events order by event_date desc limit 5;
