import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type {
  MemberMatchStat,
  MemberStatTotal,
  SeasonStanding,
  StatType,
} from '@/types/database';

export async function fetchStatTypes(): Promise<StatType[]> {
  const { data, error } = await supabase
    .from('stat_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

export function useStatTypes() {
  const [statTypes, setStatTypes] = useState<StatType[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        setStatTypes(await fetchStatTypes());
      } catch (e) {
        console.warn('[stats] 스탯 항목 조회 실패:', e);
      }
    })();
  }, []);

  return statTypes;
}

export async function fetchSeasonStandings(seasonId: string): Promise<SeasonStanding[]> {
  const { data, error } = await supabase.rpc('get_season_standings', { p_season_id: seasonId });
  if (error) throw error;
  return data ?? [];
}

/** 인자 이름은 마이그레이션과 정확히 같아야 한다 — from_date/to_date 에는 p_ 가 없다. */
export async function fetchMemberStatTotals(args: {
  from?: string | null;
  to?: string | null;
  seasonId?: string | null;
}): Promise<MemberStatTotal[]> {
  const { data, error } = await supabase.rpc('get_member_stat_totals', {
    from_date: args.from ?? null,
    to_date: args.to ?? null,
    p_season_id: args.seasonId ?? null,
  });
  if (error) throw error;
  return data ?? [];
}

export type StatRow = {
  memberId: string;
  name: string;
  /** stat_type code → 합계. 없는 항목은 키가 없다. */
  totals: Record<string, number>;
};

/**
 * RPC 는 긴 형태(회원 × 항목 한 줄씩)로 돌려준다. 스탯 항목이 데이터라서
 * 컬럼으로 펼칠 수 없기 때문이다. 화면에서 쓸 가로 형태로 바꾼다.
 */
export function pivotStatTotals(rows: MemberStatTotal[]): StatRow[] {
  const byMember = new Map<string, StatRow>();

  for (const row of rows) {
    let entry = byMember.get(row.member_id);
    if (!entry) {
      entry = { memberId: row.member_id, name: row.name, totals: {} };
      byMember.set(row.member_id, entry);
    }
    entry.totals[row.stat_type] = (entry.totals[row.stat_type] ?? 0) + row.total;
  }

  return [...byMember.values()];
}

// --- 경기별 입력 -----------------------------------------------------------

export async function fetchEventStats(eventId: string): Promise<MemberMatchStat[]> {
  const { data, error } = await supabase.from('member_match_stats').select('*').eq('event_id', eventId);
  if (error) throw error;
  return data ?? [];
}

/**
 * 값이 0 이하면 행을 지운다 — `value > 0` CHECK 때문에 0 을 저장할 수 없다.
 * upsert 는 unique (event_id, member_id, stat_type) 를 충돌 키로 쓴다.
 */
export async function setEventStat(args: {
  eventId: string;
  memberId: string;
  statType: string;
  value: number;
  recordedBy: string;
}) {
  if (args.value <= 0) {
    const { error } = await supabase
      .from('member_match_stats')
      .delete()
      .eq('event_id', args.eventId)
      .eq('member_id', args.memberId)
      .eq('stat_type', args.statType);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('member_match_stats').upsert(
    {
      event_id: args.eventId,
      member_id: args.memberId,
      stat_type: args.statType,
      value: args.value,
      recorded_by: args.recordedBy,
    },
    { onConflict: 'event_id,member_id,stat_type' }
  );
  if (error) throw error;
}

export async function saveMatchScore(eventId: string, home: number | null, away: number | null) {
  // events_score_check: 둘 다 있거나 둘 다 없어야 한다
  const { error } = await supabase
    .from('events')
    .update({ home_score: home, away_score: away })
    .eq('id', eventId);
  if (error) throw error;
}
