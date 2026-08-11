import { COUNTS_AS_ATTENDED } from '@/lib/attendance';
import { toLocalISODate, todayLocalISO } from '@/lib/dates';
import { fetchStatsEvents, type EventWithVotes } from '@/lib/events';
import { supabase } from '@/lib/supabase';
import { attendanceCodes } from '@/lib/vote-options';
import type { AttendanceStat, VoteOption } from '@/types/database';

export type PeriodKey =
  | 'recent1m'
  | 'recent3m'
  | 'recent6m'
  | 'thisYear'
  | 'lastYear'
  | 'all'
  | 'custom';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  recent1m: '1개월',
  recent3m: '3개월',
  recent6m: '6개월',
  thisYear: '올해',
  lastYear: '작년',
  all: '전체',
  custom: '직접 선택',
};

export type Range = { from: string | null; to: string | null };

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return toLocalISODate(d);
}

/** 기간 프리셋 -> 실제 날짜 범위. custom 은 화면에서 직접 넘긴다. */
export function rangeFor(period: PeriodKey): Range {
  const year = new Date().getFullYear();
  switch (period) {
    case 'recent1m':
      return { from: monthsAgo(1), to: todayLocalISO() };
    case 'recent3m':
      return { from: monthsAgo(3), to: todayLocalISO() };
    case 'recent6m':
      return { from: monthsAgo(6), to: todayLocalISO() };
    case 'thisYear':
      return { from: `${year}-01-01`, to: todayLocalISO() };
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case 'all':
    case 'custom':
    default:
      return { from: null, to: null };
  }
}

export type TeamSummary = {
  memberCount: number;
  /** 출석 체크가 끝난 경기 수 (참석률의 분모) */
  recordedEvents: number;
  /** 집계 대상 경기 수 (투표 응답률의 분모) */
  targetEvents: number;
  /** 회원 참석률의 평균 */
  avgRate: number;
  /** 경기당 평균 참석 인원 (참석 + 지각) */
  avgAttendees: number;
  top: AttendanceStat | null;
};

/** 출석 기록이 아직 없으면 참석률을 보여줄 수 없다. 화면에서 이 값으로 분기한다. */
export function hasAttendanceData(rows: AttendanceStat[]): boolean {
  return (rows[0]?.recorded_events ?? 0) > 0;
}

export function summarizeTeam(rows: AttendanceStat[]): TeamSummary {
  const recordedEvents = rows[0]?.recorded_events ?? 0;
  const targetEvents = rows[0]?.vote_target_events ?? 0;
  if (rows.length === 0) {
    return {
      memberCount: 0,
      recordedEvents,
      targetEvents,
      avgRate: 0,
      avgAttendees: 0,
      top: null,
    };
  }

  const rateSum = rows.reduce((acc, r) => acc + Number(r.attendance_rate), 0);
  const attendedSum = rows.reduce((acc, r) => acc + r.present_count + r.late_count, 0);
  const top = rows.reduce((best, r) =>
    Number(r.attendance_rate) > Number(best.attendance_rate) ? r : best
  );

  return {
    memberCount: rows.length,
    recordedEvents,
    targetEvents,
    avgRate: Math.round((rateSum / rows.length) * 10) / 10,
    avgAttendees:
      recordedEvents === 0 ? 0 : Math.round((attendedSum / recordedEvents) * 10) / 10,
    top,
  };
}

export type TrendPoint = {
  eventId: string;
  date: string;
  title: string;
  /** 실제 출석 인원(참석 + 지각). 출석 기록이 없으면 투표 인원으로 대체한다. */
  attendCount: number;
  fromVotes: boolean;
};

/**
 * 경기별 참석 인원 추이.
 * 출석을 기록한 경기는 실제 출석 인원을, 아직 기록하지 않은 경기는 투표 인원을 쓴다.
 * 섞이는 걸 화면에서 알 수 있도록 fromVotes 로 표시한다.
 */
export function toTrend(events: EventWithVotes[], options: VoteOption[]): TrendPoint[] {
  const codes = attendanceCodes(options);
  return events.map((e) => {
    const recorded = e.attendance ?? [];
    const hasRecord = recorded.length > 0;
    return {
      eventId: e.id,
      date: e.event_date,
      title: e.title,
      attendCount: hasRecord
        ? recorded.filter((a) => COUNTS_AS_ATTENDED.includes(a.status)).length
        : e.votes.filter((v) => codes.has(v.vote)).length,
      fromVotes: !hasRecord,
    };
  });
}

export type SortKey = 'rate' | 'name' | 'attend';

const attended = (r: AttendanceStat) => r.present_count + r.late_count;

export function sortStats(rows: AttendanceStat[], key: SortKey): AttendanceStat[] {
  const sorted = [...rows];
  if (key === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  else if (key === 'attend') sorted.sort((a, b) => attended(b) - attended(a));
  else
    sorted.sort(
      (a, b) =>
        Number(b.attendance_rate) - Number(a.attendance_rate) || attended(b) - attended(a)
    );
  return sorted;
}

export type StatsPayload = {
  rows: AttendanceStat[];
  trend: TrendPoint[];
};

export async function fetchStats(range: Range, options: VoteOption[]): Promise<StatsPayload> {
  const [statsResult, events] = await Promise.all([
    supabase.rpc('get_attendance_stats', { from_date: range.from, to_date: range.to }),
    fetchStatsEvents(range.from, range.to),
  ]);

  if (statsResult.error) throw statsResult.error;

  return {
    rows: (statsResult.data ?? []) as AttendanceStat[],
    trend: toTrend(events, options),
  };
}
