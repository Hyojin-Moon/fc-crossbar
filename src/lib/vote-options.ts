import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { TeamEvent, VoteCode, VoteOption } from '@/types/database';

/**
 * 투표 선택지는 DB(vote_options)에서 온다. 하드코딩하지 않는다.
 * 지각/조기귀가/게스트를 켜려면 DB 에서 is_active = true 로 바꾸고
 * 해당 events.allowed_votes 배열에 코드를 넣으면 앱은 그대로 따라간다.
 *
 * 거의 바뀌지 않는 값이라 모듈 레벨에 캐시한다.
 */
let cache: VoteOption[] | null = null;
let inflight: Promise<VoteOption[]> | null = null;

const FALLBACK: VoteOption[] = [
  { code: 'attend', label: '참석', counts_as_attendance: true, sort_order: 1, is_active: true },
  { code: 'absent', label: '불참', counts_as_attendance: false, sort_order: 2, is_active: true },
];

async function fetchVoteOptions(): Promise<VoteOption[]> {
  const { data, error } = await supabase.from('vote_options').select('*').order('sort_order');
  if (error || !data?.length) {
    if (error) console.warn('[vote-options] 조회 실패, 기본값 사용:', error.message);
    return FALLBACK;
  }
  cache = data;
  return data;
}

export async function loadVoteOptions(): Promise<VoteOption[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetchVoteOptions().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function useVoteOptions() {
  const [options, setOptions] = useState<VoteOption[]>(() => cache ?? FALLBACK);

  useEffect(() => {
    let alive = true;
    void loadVoteOptions().then((next) => {
      if (alive) setOptions(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return options;
}

/**
 * 켜진 선택지는 `is_active` 와 `allowed_votes` 를 모두 만족해야 한다.
 * is_active 도 봐야 하는 이유: 선택지를 끌 때(0015 의 '미정') 지난 일정의
 * allowed_votes 에 코드가 남아 있으면 그 일정만 없어진 버튼이 뜬다.
 */
export function optionsForEvent(event: TeamEvent, all: VoteOption[]): VoteOption[] {
  const byCode = new Map(all.map((o) => [o.code, o]));
  return event.allowed_votes
    .map((code) => byCode.get(code))
    .filter((o): o is VoteOption => Boolean(o?.is_active));
}

export function labelOf(code: VoteCode | null, all: VoteOption[]): string {
  if (!code) return '미투표';
  return all.find((o) => o.code === code)?.label ?? code;
}

export function attendanceCodes(all: VoteOption[]): Set<string> {
  return new Set(all.filter((o) => o.counts_as_attendance).map((o) => o.code));
}
