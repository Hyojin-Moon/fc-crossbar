-- =====================================================================
-- FC Crossbar - 0001_schema.sql
-- 테이블, 인덱스, 헬퍼 함수, 트리거, 관리자용 RPC
-- Supabase Dashboard > SQL Editor 에 붙여넣고 실행하세요.
-- 실행 순서: 0001_schema.sql -> 0002_rls.sql -> 0003_seed.sql
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. 투표 선택지 (확장 가능)
--    새 선택지(지각/조기귀가/게스트 등)는 여기에 row 만 추가하면 된다.
--    counts_as_attendance = 참석률 계산 시 '참석'으로 집계할지 여부
-- ---------------------------------------------------------------------
create table if not exists public.vote_options (
  code                 text primary key,
  label                text not null,
  counts_as_attendance boolean not null default false,
  sort_order           integer not null default 0,
  is_active            boolean not null default true
);

insert into public.vote_options (code, label, counts_as_attendance, sort_order, is_active) values
  ('attend',      '참석',     true,  1, true),
  ('absent',      '불참',     false, 2, true),
  ('maybe',       '미정',     false, 3, false),
  -- 아래는 미리 정의해 둔 확장용 선택지. is_active=false 라 기본 노출되지 않음.
  ('late',        '지각',     true,  4, false),
  ('early_leave', '조기귀가', true,  5, false),
  ('guest',       '게스트',   false, 6, false)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 2. profiles
--    id 와 user_id 를 분리한다. 다른 테이블의 FK 는 모두 profiles.id 를 가리킨다.
-- ---------------------------------------------------------------------
-- 로그인은 이메일이 아니라 아이디로 한다. 클라이언트가 아이디 뒤에
-- @fccrossbar.local 을 붙여 Supabase Auth 계정을 만든다. (실제 메일 발송 없음)
-- login_id 는 그 아이디를 화면에 보여주기 위한 사본이다. auth.users 는 클라이언트가
-- 읽을 수 없으므로 이 컬럼이 없으면 관리자 화면에서 아이디를 표시할 수 없다.
create table if not exists public.profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  login_id   text unique,
  name       text not null,
  phone      text,
  role       text not null default 'member'
             check (role in ('super_admin', 'admin', 'member')),
  status     text not null default 'active'
             check (status in ('pending', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 가입 승인제로 전환하려면 아래 한 줄만 실행하면 된다.
--   alter table public.profiles alter column status set default 'pending';

create index if not exists idx_profiles_role   on public.profiles (role);
create index if not exists idx_profiles_status on public.profiles (status);

-- ---------------------------------------------------------------------
-- 3. events (경기 / 모임)
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id                       uuid primary key default gen_random_uuid(),
  title                    text not null,
  event_date               date not null,
  start_time               time,
  end_time                 time,
  venue_name               text,
  venue_address            text,
  map_url                  text,
  description              text,
  vote_open_at             timestamptz not null default now(),
  vote_deadline            timestamptz,
  max_attendees            integer,
  -- 이 일정에서 사용할 투표 선택지. vote_options.code 의 부분집합.
  allowed_votes            text[] not null default array['attend', 'absent'],
  -- 일반 회원에게 참석자 명단을 공개할지 여부
  attendee_list_visible    boolean not null default true,
  -- 참석률 통계 계산에 포함할지 여부
  include_attendance_stats boolean not null default true,
  status                   text not null default 'open'
                           check (status in ('open', 'closed', 'cancelled')),
  created_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_events_event_date on public.events (event_date desc);
create index if not exists idx_events_status     on public.events (status);

-- ---------------------------------------------------------------------
-- 4. event_votes (참석 투표)
-- ---------------------------------------------------------------------
create table if not exists public.event_votes (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)   on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  vote        text not null references public.vote_options(code),
  guest_count integer not null default 0 check (guest_count >= 0),
  memo        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, member_id)
);

create index if not exists idx_event_votes_event_id  on public.event_votes (event_id);
create index if not exists idx_event_votes_member_id on public.event_votes (member_id);

-- ---------------------------------------------------------------------
-- 5. membership_payments (회비 납부 내역)
-- ---------------------------------------------------------------------
create table if not exists public.membership_payments (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.profiles(id) on delete cascade,
  year         integer not null check (year between 2000 and 2100),
  month        integer not null check (month between 1 and 12),
  amount       integer not null default 0 check (amount >= 0),
  payment_date date,
  status       text not null default 'unpaid'
               check (status in ('paid', 'unpaid', 'exempt')),
  memo         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (member_id, year, month)
);

create index if not exists idx_payments_member_id on public.membership_payments (member_id);
create index if not exists idx_payments_period    on public.membership_payments (year, month);

-- ---------------------------------------------------------------------
-- 6. expenses (회비 사용 내역)
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category     text not null default '기타',
  description  text not null,
  amount       integer not null check (amount >= 0),
  memo         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_expenses_date     on public.expenses (expense_date desc);
create index if not exists idx_expenses_category on public.expenses (category);

-- ---------------------------------------------------------------------
-- 7. app_settings (시스템 설정 - super_admin 전용 쓰기)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('team_name',           '"FC Crossbar"'::jsonb),
  ('monthly_fee_amount',  '30000'::jsonb),
  ('require_approval',    'false'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 8. admin_audit_logs (관리자 활동 기록 - super_admin 전용 조회)
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit_logs (
  id           bigserial primary key,
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  target_table text,
  target_id    text,
  detail       jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_audit_created_at on public.admin_audit_logs (created_at desc);

-- =====================================================================
-- 9. 헬퍼 함수
--    RLS 정책 안에서 profiles 를 직접 SELECT 하면 무한 재귀(42P17)가 난다.
--    SECURITY DEFINER 함수는 RLS 를 우회하므로 반드시 이 함수들을 통해 조회한다.
--    search_path 를 고정해 함수 하이재킹을 막는다.
-- =====================================================================
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.profiles
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() in ('admin', 'super_admin'), false);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() = 'super_admin', false);
$$;

-- 투표 가능 시간인지 판정 (RLS 에서 사용)
create or replace function public.is_vote_open(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.status = 'open'
     and now() >= e.vote_open_at
     and (e.vote_deadline is null or now() <= e.vote_deadline)
  from public.events e
  where e.id = p_event_id;
$$;

-- =====================================================================
-- 10. 트리거
-- =====================================================================

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'events', 'event_votes', 'membership_payments', 'expenses']
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
       for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;

-- auth.users 생성 시 profiles row 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id, login_id, name, phone)
  values (
    new.id,
    -- 내부 도메인으로 만든 계정만 아이디를 뽑아 둔다. 실제 이메일 가입이면 null.
    case when new.email like '%@fccrossbar.local'
         then split_part(new.email, '@', 1) end,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- role / status 무단 변경 차단 (컬럼 권한 회수와 함께 2중 방어)
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- SQL Editor / service_role 등 JWT 없는 컨텍스트는 통과 (초기 세팅용)
  if auth.uid() is null then
    return new;
  end if;

  -- super_admin 행은 super_admin 만 수정 가능
  if old.role = 'super_admin' and not public.is_super_admin() then
    raise exception 'super_admin 계정은 수정할 수 없습니다.';
  end if;

  if new.role is distinct from old.role then
    if not public.is_super_admin() then
      raise exception 'role 은 super_admin 만 변경할 수 있습니다.';
    end if;
    if new.role = 'super_admin' then
      raise exception 'super_admin 승격은 앱에서 할 수 없습니다. SQL 로만 지정하세요.';
    end if;
  end if;

  if new.status is distinct from old.status then
    -- admin 은 일반 member 의 status 만 변경 가능
    if not (public.is_super_admin()
            or (public.current_user_role() = 'admin' and old.role = 'member')) then
      raise exception 'status 변경 권한이 없습니다.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- =====================================================================
-- 11. 관리자 RPC (서버 측에서 권한 재검증)
--     클라이언트는 profiles.role / status 를 직접 UPDATE 할 수 없고,
--     반드시 아래 함수를 호출해야 한다.
-- =====================================================================

create or replace function public.log_admin_action(
  p_action text, p_table text, p_target_id text, p_detail jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id, detail)
  values (public.current_profile_id(), p_action, p_table, p_target_id, p_detail);
$$;

-- member <-> admin 승격 / 강등 (super_admin 전용)
create or replace function public.admin_set_member_role(
  target_profile_id uuid, new_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.profiles;
begin
  if not public.is_super_admin() then
    raise exception 'super_admin 권한이 필요합니다.' using errcode = '42501';
  end if;
  if new_role not in ('admin', 'member') then
    raise exception 'role 은 admin 또는 member 만 지정할 수 있습니다.' using errcode = '22023';
  end if;

  select * into target from public.profiles where id = target_profile_id;
  if not found then
    raise exception '대상 회원을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if target.role = 'super_admin' then
    raise exception 'super_admin 계정의 권한은 변경할 수 없습니다.' using errcode = '42501';
  end if;

  update public.profiles set role = new_role where id = target_profile_id returning * into target;
  perform public.log_admin_action('set_role', 'profiles', target_profile_id::text,
                                  jsonb_build_object('new_role', new_role));
  return target;
end;
$$;

-- 회원 활성화 / 비활성화 / 승인 (admin 은 member 대상만)
create or replace function public.admin_set_member_status(
  target_profile_id uuid, new_status text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.profiles;
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;
  if new_status not in ('pending', 'active', 'inactive') then
    raise exception '잘못된 status 값입니다.' using errcode = '22023';
  end if;

  select * into target from public.profiles where id = target_profile_id;
  if not found then
    raise exception '대상 회원을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if target.role = 'super_admin' then
    raise exception 'super_admin 계정은 변경할 수 없습니다.' using errcode = '42501';
  end if;
  if target.role = 'admin' and not public.is_super_admin() then
    raise exception '다른 관리자 계정은 super_admin 만 변경할 수 있습니다.' using errcode = '42501';
  end if;

  update public.profiles set status = new_status where id = target_profile_id returning * into target;
  perform public.log_admin_action('set_status', 'profiles', target_profile_id::text,
                                  jsonb_build_object('new_status', new_status));
  return target;
end;
$$;

-- 회원 삭제 (super_admin 전용). auth.users 삭제는 Dashboard 에서 별도로 수행.
create or replace function public.admin_delete_member(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.profiles;
begin
  if not public.is_super_admin() then
    raise exception 'super_admin 권한이 필요합니다.' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = target_profile_id;
  if not found then
    raise exception '대상 회원을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if target.role = 'super_admin' then
    raise exception 'super_admin 계정은 삭제할 수 없습니다.' using errcode = '42501';
  end if;

  perform public.log_admin_action('delete_member', 'profiles', target_profile_id::text,
                                  to_jsonb(target));
  delete from public.profiles where id = target_profile_id;
end;
$$;

-- =====================================================================
-- 12. 통계 RPC
--     SECURITY INVOKER(기본) 이므로 호출자의 RLS 가 그대로 적용된다.
--     include_attendance_stats = false 인 일정은 제외.
-- =====================================================================
create or replace function public.get_attendance_stats(
  from_date date default null,
  to_date   date default null
)
returns table (
  member_id     uuid,
  name          text,
  attend_count  integer,
  absent_count  integer,
  maybe_count   integer,
  no_vote_count integer,
  total_events  integer,
  attendance_rate numeric
)
language sql
stable
as $$
  with target_events as (
    select e.id
    from public.events e
    where e.include_attendance_stats
      and e.status <> 'cancelled'
      -- 아직 치르지 않은 경기는 모수에서 제외한다.
      -- (포함하면 예정 경기 때문에 전원 참석률이 낮게 나온다)
      and e.event_date <= current_date
      and (from_date is null or e.event_date >= from_date)
      and (to_date   is null or e.event_date <= to_date)
  ),
  event_count as (select count(*)::int as n from target_events)
  select
    p.id,
    p.name,
    count(*) filter (where vo.counts_as_attendance)::int,
    count(*) filter (where v.vote = 'absent')::int,
    count(*) filter (where v.vote = 'maybe')::int,
    ((select n from event_count) - count(v.id))::int,
    (select n from event_count),
    case when (select n from event_count) = 0 then 0
         else round(count(*) filter (where vo.counts_as_attendance) * 100.0
                    / (select n from event_count), 1)
    end
  from public.profiles p
  left join public.event_votes v
         on v.member_id = p.id and v.event_id in (select id from target_events)
  left join public.vote_options vo on vo.code = v.vote
  where p.status = 'active'
  group by p.id, p.name
  order by 8 desc, p.name;
$$;

-- =====================================================================
-- 13. 권한 (컬럼 단위 UPDATE 제한)
--     RLS 의 WITH CHECK 만으로는 "이전 값과 비교"가 불가능하므로,
--     authenticated 롤에서 UPDATE 권한을 회수하고 안전한 컬럼만 다시 부여한다.
--     -> 클라이언트에서 role/status 를 직접 UPDATE 하는 것이 원천 차단된다.
-- =====================================================================
revoke update on public.profiles from authenticated;
grant  update (name, phone) on public.profiles to authenticated;

-- 함수는 기본적으로 PUBLIC 에 EXECUTE 가 부여된다. 필요한 롤에만 남기고 회수한다.
revoke execute on function public.admin_set_member_role(uuid, text)   from public;
revoke execute on function public.admin_set_member_status(uuid, text) from public;
revoke execute on function public.admin_delete_member(uuid)           from public;
revoke execute on function public.get_attendance_stats(date, date)    from public;
revoke execute on function public.log_admin_action(text, text, text, jsonb) from public;

grant execute on function public.admin_set_member_role(uuid, text)   to authenticated;
grant execute on function public.admin_set_member_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_member(uuid)           to authenticated;
grant execute on function public.get_attendance_stats(date, date)    to authenticated;
-- log_admin_action 은 내부 전용이라 어떤 롤에도 부여하지 않는다.
-- (SECURITY DEFINER 함수 안에서 소유자 권한으로 호출된다)
