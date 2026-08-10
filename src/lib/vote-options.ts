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

/** DB 를 못 읽었을 때만 쓰는 최소 기본값. 0001_schema.sql 의 초기 3개와 같다. */
const FALLBACK: VoteOption[] = [
  { code: 'attend', label: '참석', counts_as_attendance: true, sort_order: 1, is_active: true },
  { code: 'absent', label: '불참', counts_as_attendance: false, sort_order: 2, is_active: true },
  { code: 'maybe', label: '미정', counts_as_attendance: false, sort_order: 3, is_active: true },
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

/** 이 일정에서 실제로 누를 수 있는 선택지. allowed_votes 순서를 따른다. */
export function optionsForEvent(event: TeamEvent, all: VoteOption[]): VoteOption[] {
  const byCode = new Map(all.map((o) => [o.code, o]));
  return event.allowed_votes
    .map((code) => byCode.get(code))
    .filter((o): o is VoteOption => Boolean(o));
}

export function labelOf(code: VoteCode | null, all: VoteOption[]): string {
  if (!code) return '미투표';
  return all.find((o) => o.code === code)?.label ?? code;
}

/** 참석률 계산에서 '참석'으로 세는 코드들. get_attendance_stats() 와 같은 기준. */
export function attendanceCodes(all: VoteOption[]): Set<string> {
  return new Set(all.filter((o) => o.counts_as_attendance).map((o) => o.code));
}
