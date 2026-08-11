-- =====================================================================
-- FC Crossbar - 0004_login_id.sql
--
-- 로그인 방식을 "이메일 + 비밀번호" -> "아이디 + 비밀번호" 로 바꾸면서
-- profiles.login_id 를 추가한다.
--
-- 0001_schema.sql 에도 같은 내용이 반영되어 있으므로, DB 를 새로 만드는
-- 경우에는 이 파일을 실행하지 않아도 된다.
-- 이미 0001 을 실행해 둔 프로젝트에서만 이 파일을 실행한다. (재실행 안전)
-- =====================================================================

-- 1. 컬럼 추가
alter table public.profiles add column if not exists login_id text;

create unique index if not exists profiles_login_id_key on public.profiles (login_id);

-- 2. 기존 회원 백필 — 내부 도메인으로 만든 계정만 아이디를 채운다
update public.profiles p
set    login_id = split_part(u.email, '@', 1)
from   auth.users u
where  u.id = p.user_id
  and  p.login_id is null
  and  u.email like '%@fccrossbar.local';

-- 3. 트리거 갱신 (신규 가입 시 login_id 자동 입력)
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
    case when new.email like '%@fccrossbar.local'
         then split_part(new.email, '@', 1) end,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 4. login_id 는 사용자가 직접 바꿀 수 없다.
--    (0001 에서 name/nickname/phone 만 GRANT 했으므로 이미 막혀 있지만,
--     혹시 권한이 넓게 부여된 상태라면 여기서 다시 좁힌다)
revoke update on public.profiles from authenticated;
grant  update (name, phone) on public.profiles to authenticated;

-- 확인
-- select login_id, name, role, status from public.profiles order by created_at;
