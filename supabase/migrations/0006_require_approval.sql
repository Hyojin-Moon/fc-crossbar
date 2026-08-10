-- =====================================================================
-- FC Crossbar - 0006_require_approval.sql
--
-- 가입 승인제를 app_settings 로 켜고 끌 수 있게 한다.
--
-- 기존에는 profiles.status 의 DEFAULT 를 ALTER TABLE 로 바꿔야 했다.
-- 그 방식은 앱에서 토글할 수 없으므로, handle_new_user 트리거가
-- app_settings.require_approval 을 읽어 status 를 정하도록 바꾼다.
--
-- require_approval = true  -> 신규 가입자는 'pending' (승인 대기 화면을 본다)
-- require_approval = false -> 'active' (바로 이용)
--
-- 재실행해도 안전하다.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  needs_approval boolean := false;
begin
  -- SECURITY DEFINER 이므로 이 조회는 소유자 권한으로 RLS 를 우회한다. 의도된 동작이다.
  -- (가입 시점의 사용자는 아직 profiles 행이 없어 is_admin() 류를 쓸 수 없다)
  select coalesce((s.value #>> '{}')::boolean, false)
    into needs_approval
    from public.app_settings s
   where s.key = 'require_approval';

  insert into public.profiles (user_id, login_id, name, nickname, phone, status)
  values (
    new.id,
    case when new.email like '%@fccrossbar.local'
         then split_part(new.email, '@', 1) end,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when needs_approval then 'pending' else 'active' end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- 트리거는 그대로 유지되지만 재실행 안전을 위해 다시 걸어 둔다.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 설정 키가 없으면 만들어 둔다 (0001 에서 이미 넣지만 방어적으로)
insert into public.app_settings (key, value) values ('require_approval', 'false'::jsonb)
on conflict (key) do nothing;

-- 확인
-- select key, value from public.app_settings order by key;
