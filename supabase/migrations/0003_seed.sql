-- =====================================================================
-- FC Crossbar - 0003_seed.sql
-- 관리자 계정 지정 + 샘플 데이터
--
-- 주의: 이 파일은 "가입이 끝난 뒤" 실행한다.
--       profiles 행은 회원가입 시 트리거로 자동 생성되므로,
--       앱에서 먼저 회원가입한 다음 아래 1번을 실행해야 한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Super Admin 지정  (★ 아이디만 본인 것으로 바꿔서 실행)
--    super_admin 은 앱 화면에서 부여할 수 없고 오직 이 SQL 로만 지정된다.
-- ---------------------------------------------------------------------
update public.profiles
set    role = 'super_admin', status = 'active'
where  login_id = 'your-login-id';   -- ★ 여기를 수정

-- 확인
-- select login_id, name, role, status from public.profiles order by created_at;

-- ---------------------------------------------------------------------
-- 2. 일반 관리자 지정 (선택)
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'admin' where login_id = 'manager-id';

-- =====================================================================
-- 3. 샘플 데이터 (개발/테스트용 - 운영 DB 에서는 실행하지 말 것)
--    아래 블록 전체를 실행하면 지난 일정 6개 + 예정 일정 2개와
--    현재 등록된 활성 회원들의 투표/회비/지출 샘플이 생성된다.
-- =====================================================================
do $$
declare
  admin_profile uuid;
  ev            record;
  member_row    record;
  idx           integer;
  vote_code     text;
begin
  select id into admin_profile from public.profiles
   where role in ('super_admin', 'admin') order by created_at limit 1;

  if admin_profile is null then
    raise notice '관리자 계정이 없습니다. 1번을 먼저 실행하세요. 샘플 데이터를 건너뜁니다.';
    return;
  end if;

  -- events / expenses 는 PK 가 gen_random_uuid() 라서 매번 새 UUID 가 생긴다.
  -- 즉 on conflict do nothing 이 걸리지 않아 재실행하면 일정이 중복 생성된다.
  -- 그래서 "일정이 하나도 없을 때만" 샘플을 넣는다.
  if exists (select 1 from public.events) then
    raise notice '이미 일정이 있습니다. 샘플 데이터를 건너뜁니다. (중복 생성 방지)';
    return;
  end if;

  -- 지난 일정 6개 (주 단위로 과거)
  for idx in 1..6 loop
    insert into public.events (
      title, event_date, start_time, end_time, venue_name, venue_address,
      vote_open_at, vote_deadline, max_attendees, status, created_by
    ) values (
      format('%s주 전 정기전', idx),
      (current_date - (idx * 7))::date,
      '20:00', '22:00',
      '크로스바 풋살파크', '서울시 어딘가 123',
      ((current_date - (idx * 7) - 6)::timestamp at time zone 'Asia/Seoul'),
      ((current_date - (idx * 7) - 1 + time '18:00') at time zone 'Asia/Seoul'),
      22, 'closed', admin_profile
    )
    on conflict do nothing;
  end loop;

  -- 예정 일정 2개 (하나는 투표 진행 중)
  insert into public.events (
    title, event_date, start_time, end_time, venue_name, venue_address, map_url,
    description, vote_open_at, vote_deadline, max_attendees, status, created_by
  ) values
    ('이번 주 경기', (current_date + 3), '20:00', '22:00',
     '크로스바 풋살파크', '서울시 어딘가 123', 'https://map.naver.com',
     '조끼 챙겨오세요', now(), ((current_date + 2 + time '18:00') at time zone 'Asia/Seoul'),
     22, 'open', admin_profile),
    ('다음 주 경기', (current_date + 10), '20:00', '22:00',
     '한강 축구장', '서울시 어딘가 456', null,
     null, ((current_date + 4)::timestamp at time zone 'Asia/Seoul'),
     ((current_date + 9 + time '18:00') at time zone 'Asia/Seoul'),
     22, 'open', admin_profile)
  on conflict do nothing;

  -- 지난 일정에 대한 투표 샘플 (회원마다 다른 패턴)
  idx := 0;
  for member_row in select id from public.profiles where status = 'active' order by created_at loop
    idx := idx + 1;
    for ev in select id, row_number() over (order by event_date) as rn
              from public.events where event_date < current_date loop
      -- 미투표도 섞이도록 일부는 건너뛴다
      continue when (idx + ev.rn) % 7 = 0;
      vote_code := case (idx + ev.rn) % 5
                     when 0 then 'absent'
                     when 1 then 'maybe'
                     else 'attend'
                   end;
      insert into public.event_votes (event_id, member_id, vote)
      values (ev.id, member_row.id, vote_code)
      on conflict (event_id, member_id) do nothing;
    end loop;
  end loop;

  -- 최근 3개월 회비 납부 내역
  for member_row in select id from public.profiles where status = 'active' loop
    for idx in 0..2 loop
      insert into public.membership_payments (
        member_id, year, month, amount, payment_date, status, created_by
      ) values (
        member_row.id,
        extract(year  from (current_date - (idx || ' month')::interval))::int,
        extract(month from (current_date - (idx || ' month')::interval))::int,
        30000,
        (date_trunc('month', current_date - (idx || ' month')::interval) + interval '4 day')::date,
        case when idx = 0 then 'unpaid' else 'paid' end,
        admin_profile
      )
      on conflict (member_id, year, month) do nothing;
    end loop;
  end loop;

  -- 지출 내역
  insert into public.expenses (expense_date, category, description, amount, created_by) values
    (current_date - 20, '구장비',    '풋살파크 대관 4회', 480000, admin_profile),
    (current_date - 14, '장비',      '축구공 3개',         90000, admin_profile),
    (current_date - 7,  '음료/간식', '경기 후 음료',       35000, admin_profile),
    (current_date - 3,  '구장비',    '한강 축구장 대관',  120000, admin_profile)
  on conflict do nothing;

  raise notice '샘플 데이터 생성 완료';
end;
$$;
