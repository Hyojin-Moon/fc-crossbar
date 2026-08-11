-- =====================================================================
-- FC Crossbar - 0005_dev_members.sql
--
-- 개발/테스트용 더미 회원 생성. **운영 DB 에서는 실행하지 말 것.**
--
-- 통계와 회비 화면은 회원이 여러 명이어야 의미가 보인다. 그런데 profiles.user_id 가
-- auth.users 를 참조하므로 프로필만 따로 만들 수 없다. 그래서 auth.users 에 직접
-- 계정을 넣고, handle_new_user 트리거가 profiles 를 만들게 한다.
--
-- 생성되는 계정: 아이디 test1 ~ test7
--
-- ★ 비밀번호는 의도적으로 '알 수 없는 값'이다. 통계·회비 화면을 채우는 데는
--   프로필만 있으면 되고, 저장소에 공용 비밀번호를 남기면 이 SQL 을 본 사람이
--   누구나 팀 데이터에 로그인할 수 있게 된다.
--   특정 계정으로 로그인해 회원 시점을 보고 싶으면
--   Supabase Dashboard > Authentication > Users > 해당 계정에서 비밀번호를 직접 정한다.
--
-- 재실행해도 안전하다. 이미 있는 아이디는 건너뛴다.
-- 지우려면 파일 맨 아래 정리 쿼리를 쓴다.
-- =====================================================================

do $$
declare
  people   text[][] := array[
    ['test1', '김철수'],
    ['test2', '이민수'],
    ['test3', '박영호'],
    ['test4', '홍길동'],
    ['test5', '최준호'],
    ['test6', '정대만'],
    ['test7', '강백호']
  ];
  i            integer;
  login_id     text;
  member_name  text;
  new_uid      uuid;
  created      integer := 0;
  -- 무작위 문자열의 bcrypt 해시. 형식은 유효하지만 아무 비밀번호와도 맞지 않는다.
  -- (pgcrypto 의 crypt() 를 쓰지 않는 이유: Supabase 에서는 extensions 스키마에 있어
  --  search_path 에 따라 함수를 못 찾을 수 있다)
  unusable_pw  text := '$2a$10$IJ.XQtlo5LKxfLI6Etar5uT6UZPdGGX/4hZ24JNOw.nL.b1PnjG9a';
begin
  for i in 1 .. array_length(people, 1) loop
    login_id    := people[i][1];
    member_name := people[i][2];

    if exists (select 1 from auth.users u where u.email = login_id || '@fccrossbar.local') then
      continue;
    end if;

    new_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000',
      new_uid,
      'authenticated',
      'authenticated',
      login_id || '@fccrossbar.local',
      unusable_pw,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', member_name)
    );
    created := created + 1;
  end loop;

  raise notice '더미 회원 % 명 생성 (비밀번호 미설정 - 로그인 불가)', created;
end;
$$;

-- ---------------------------------------------------------------------
-- 지난 일정에 대한 투표 채우기 (아직 투표가 없는 회원만)
-- 회원마다 다른 패턴이 나오게 해서 참석률이 골고루 퍼지도록 한다.
-- ---------------------------------------------------------------------
do $$
declare
  member_row record;
  ev         record;
  idx        integer := 0;
  vote_code  text;
begin
  for member_row in
    select p.id from public.profiles p where p.status = 'active' order by p.created_at
  loop
    idx := idx + 1;
    for ev in
      select e.id, row_number() over (order by e.event_date) as rn
      from public.events e
      where e.event_date < current_date
    loop
      -- 회원 순서에 따라 참석 성향을 다르게 둬서 참석률이 16% ~ 83% 로 퍼지게 한다.
      -- null 이면 미투표로 남긴다.
      if ((ev.rn * 13 + idx * 7) % 10) < (idx + 1) then
        vote_code := 'attend';
      elsif ((ev.rn * 3 + idx) % 7) = 0 then
        vote_code := null;
      else
        vote_code := 'absent';
      end if;

      if vote_code is not null then
        insert into public.event_votes (event_id, member_id, vote)
        values (ev.id, member_row.id, vote_code)
        on conflict (event_id, member_id) do nothing;
      end if;
    end loop;
  end loop;

  raise notice '투표 샘플 채움';
end;
$$;

-- ---------------------------------------------------------------------
-- 최근 3개월 회비 (없는 것만)
-- ---------------------------------------------------------------------
do $$
declare
  admin_profile uuid;
  member_row    record;
  idx           integer;
  n             integer := 0;
begin
  select id into admin_profile from public.profiles
   where role in ('super_admin', 'admin') order by created_at limit 1;

  for member_row in select id from public.profiles where status = 'active' loop
    n := n + 1;
    for idx in 0 .. 2 loop
      insert into public.membership_payments (
        member_id, year, month, amount, payment_date, status, created_by
      ) values (
        member_row.id,
        extract(year  from (current_date - (idx || ' month')::interval))::int,
        extract(month from (current_date - (idx || ' month')::interval))::int,
        30000,
        case when idx = 0 and n % 4 = 0 then null
             else (date_trunc('month', current_date - (idx || ' month')::interval)
                   + interval '4 day')::date end,
        -- 이번 달은 일부 미납으로 두어 '미납 N명' 이 보이게 한다
        case when idx = 0 and n % 4 = 0 then 'unpaid' else 'paid' end,
        admin_profile
      )
      on conflict (member_id, year, month) do nothing;
    end loop;
  end loop;

  raise notice '회비 샘플 채움';
end;
$$;

-- 확인
-- select login_id, name, nickname, role, status from public.profiles order by created_at;

-- =====================================================================
-- 정리 (더미 회원 전부 삭제)
-- auth.users 를 지우면 profiles / event_votes / membership_payments 가
-- ON DELETE CASCADE 로 함께 삭제된다.
-- =====================================================================
-- delete from auth.users
-- where email like 'test%@fccrossbar.local';
