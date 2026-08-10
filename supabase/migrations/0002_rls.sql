-- =====================================================================
-- FC Crossbar - 0002_rls.sql
-- Row Level Security 정책
--
-- 원칙
--  - 모든 테이블에 RLS 활성화
--  - 정책 안에서는 profiles 를 직접 SELECT 하지 않고 0001 의 SECURITY DEFINER
--    헬퍼(is_admin / is_super_admin / current_profile_id)만 사용한다. (재귀 방지)
--  - 회비/지출 데이터는 관리자만 읽을 수 있다.
--  - role/status 변경은 RLS 가 아니라 컬럼 권한 + 트리거 + RPC 로 막는다. (0001 참고)
-- =====================================================================

alter table public.profiles            enable row level security;
alter table public.events              enable row level security;
alter table public.event_votes         enable row level security;
alter table public.membership_payments enable row level security;
alter table public.expenses            enable row level security;
alter table public.vote_options        enable row level security;
alter table public.app_settings        enable row level security;
alter table public.admin_audit_logs    enable row level security;

-- 기존 정책 정리 (재실행 가능하도록)
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'events', 'event_votes', 'membership_payments',
                        'expenses', 'vote_options', 'app_settings', 'admin_audit_logs')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------

-- 활성 회원 정보는 로그인한 사람이면 볼 수 있다. 본인 행은 상태와 무관하게 조회 가능.
create policy profiles_select on public.profiles
  for select to authenticated
  using (status = 'active' or user_id = auth.uid() or public.is_admin());

-- 트리거(handle_new_user)가 대신 만들어 주지만, 누락 시 본인 행 생성 허용.
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid());

-- UPDATE 는 본인 또는 관리자. 단 실제로 바꿀 수 있는 컬럼은
-- name / nickname / phone 뿐이다 (0001 의 컬럼 GRANT 참고).
create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- 삭제는 super_admin 만. (앱에서는 admin_delete_member RPC 사용 권장)
create policy profiles_delete_super_admin on public.profiles
  for delete to authenticated
  using (public.is_super_admin() and role <> 'super_admin');

-- ---------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------
create policy events_select on public.events
  for select to authenticated
  using (public.current_profile_id() is not null);

create policy events_insert_admin on public.events
  for insert to authenticated
  with check (public.is_admin());

create policy events_update_admin on public.events
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy events_delete_admin on public.events
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- event_votes
-- 일반 회원도 참석자 명단을 볼 수 있다.
-- 단 events.attendee_list_visible = false 이면 본인 투표만 보인다. (확장 대비)
-- ---------------------------------------------------------------------
create policy event_votes_select on public.event_votes
  for select to authenticated
  using (
    public.is_admin()
    or member_id = public.current_profile_id()
    or exists (
      select 1 from public.events e
      where e.id = event_votes.event_id and e.attendee_list_visible
    )
  );

-- 본인 투표만, 투표 기간 안에서만 생성. 관리자는 대리 입력 가능.
create policy event_votes_insert on public.event_votes
  for insert to authenticated
  with check (
    public.is_admin()
    or (member_id = public.current_profile_id() and public.is_vote_open(event_id))
  );

create policy event_votes_update on public.event_votes
  for update to authenticated
  using (
    public.is_admin()
    or (member_id = public.current_profile_id() and public.is_vote_open(event_id))
  )
  with check (
    public.is_admin()
    or (member_id = public.current_profile_id() and public.is_vote_open(event_id))
  );

create policy event_votes_delete on public.event_votes
  for delete to authenticated
  using (
    public.is_admin()
    or (member_id = public.current_profile_id() and public.is_vote_open(event_id))
  );

-- ---------------------------------------------------------------------
-- membership_payments : 관리자 전용 (일반 회원 접근 불가)
-- ---------------------------------------------------------------------
create policy payments_all_admin on public.membership_payments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- expenses : 관리자 전용
-- ---------------------------------------------------------------------
create policy expenses_all_admin on public.expenses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- vote_options : 모두 읽기, super_admin 만 쓰기
-- ---------------------------------------------------------------------
create policy vote_options_select on public.vote_options
  for select to authenticated
  using (true);

create policy vote_options_write_super_admin on public.vote_options
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------
-- app_settings : 모두 읽기, super_admin 만 쓰기
-- ---------------------------------------------------------------------
create policy app_settings_select on public.app_settings
  for select to authenticated
  using (true);

create policy app_settings_write_super_admin on public.app_settings
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------
-- admin_audit_logs : super_admin 만 조회. 쓰기는 SECURITY DEFINER 함수로만.
-- ---------------------------------------------------------------------
create policy audit_select_super_admin on public.admin_audit_logs
  for select to authenticated
  using (public.is_super_admin());

-- =====================================================================
-- 테이블 권한
-- profiles 의 UPDATE 는 0001 에서 컬럼 단위로만 부여했으므로 여기서 손대지 않는다.
-- =====================================================================
grant usage on schema public to anon, authenticated;

grant select, insert, delete on public.profiles            to authenticated;
grant select, insert, update, delete on public.events              to authenticated;
grant select, insert, update, delete on public.event_votes         to authenticated;
grant select, insert, update, delete on public.membership_payments to authenticated;
grant select, insert, update, delete on public.expenses            to authenticated;
grant select, insert, update, delete on public.vote_options        to authenticated;
grant select, insert, update, delete on public.app_settings        to authenticated;
grant select on public.admin_audit_logs to authenticated;
grant usage, select on sequence public.admin_audit_logs_id_seq to authenticated;

-- anon 롤은 어떤 데이터에도 접근할 수 없다.
revoke all on public.profiles, public.events, public.event_votes,
              public.membership_payments, public.expenses,
              public.vote_options, public.app_settings, public.admin_audit_logs
  from anon;
