-- =====================================================================
-- FC Crossbar - 0015_remove_maybe_vote.sql
--
-- 투표 선택지를 참석 / 불참 두 개로 줄인다. '미정' 을 뺀다.
--
-- vote_options 의 row 는 지우지 않는다 — event_votes.vote 가 이 테이블을
-- FK 로 참조하고 있고, 나중에 다시 켜고 싶을 수도 있다. is_active = false 로만 둔다.
-- (지각 · 조기귀가 · 게스트가 이미 같은 방식으로 꺼져 있다)
--
-- ★ 남아 있는 '미정' 투표는 지운다. 안 지우면 숫자가 어긋난다 —
--    summarizeVotes() 는 모든 투표 row 를 total 에 세고 미투표를
--    (명부 인원 - total) 로 구하므로, 화면에 그려지지 않는 미정 row 가
--    남으면 참석 + 불참 + 미투표 < 인원수 가 된다.
--    '미정' 은 "아직 안 정했다" 이므로 미투표와 의미가 가장 가깝다.
--
-- 재실행해도 안전하다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 선택지 비활성
-- ---------------------------------------------------------------------
update public.vote_options set is_active = false where code = 'maybe';

-- ---------------------------------------------------------------------
-- 2. 새 일정의 기본 선택지
-- ---------------------------------------------------------------------
alter table public.events
  alter column allowed_votes set default array['attend', 'absent'];

-- ---------------------------------------------------------------------
-- 3. 기존 일정에서 'maybe' 제거
--    지난 일정도 함께 바꾼다. 남겨 두면 그 일정만 미정 버튼이 뜬다.
-- ---------------------------------------------------------------------
update public.events
set    allowed_votes = array_remove(allowed_votes, 'maybe')
where  'maybe' = any(allowed_votes);

-- allowed_votes 가 비면 투표 버튼이 하나도 그려지지 않는다 (미정만 허용했던 일정)
update public.events
set    allowed_votes = array['attend', 'absent']
where  cardinality(allowed_votes) = 0;

-- ---------------------------------------------------------------------
-- 4. 남아 있는 '미정' 투표 삭제 → 그 회원은 '미투표' 가 된다
-- ---------------------------------------------------------------------
delete from public.event_votes where vote = 'maybe';

-- 확인
-- select code, label, is_active from public.vote_options order by sort_order;
-- select distinct allowed_votes from public.events;
-- select count(*) from public.event_votes where vote = 'maybe';   -- 0 이어야 한다
