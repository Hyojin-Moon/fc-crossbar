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
  totalEvents: number;
  /** 회원 참석률의 평균 */
  avgRate: number;
  /** 경기당 평균 참석 인원 */
  avgAttendees: number;
  top: AttendanceStat | null;
};

export function summarizeTeam(rows: AttendanceStat[]): TeamSummary {
  const totalEvents = rows[0]?.total_events ?? 0;
  if (rows.length === 0) {
    return { memberCount: 0, totalEvents, avgRate: 0, avgAttendees: 0, top: null };
  }

  const rateSum = rows.reduce((acc, r) => acc + Number(r.attendance_rate), 0);
  const attendSum = rows.reduce((acc, r) => acc + r.attend_count, 0);
  const top = rows.reduce((best, r) =>
    Number(r.attendance_rate) > Number(best.attendance_rate) ? r : best
  );

  return {
    memberCount: rows.length,
    totalEvents,
    avgRate: Math.round((rateSum / rows.length) * 10) / 10,
    avgAttendees: totalEvents === 0 ? 0 : Math.round((attendSum / totalEvents) * 10) / 10,
    top,
  };
}

export type TrendPoint = {
  eventId: string;
  date: string;
  title: string;
  attendCount: number;
};

/** 경기별 참석 인원 추이. counts_as_attendance 기준. */
export function toTrend(events: EventWithVotes[], options: VoteOption[]): TrendPoint[] {
  const codes = attendanceCodes(options);
  return events.map((e) => ({
    eventId: e.id,
    date: e.event_date,
    title: e.title,
    attendCount: e.votes.filter((v) => codes.has(v.vote)).length,
  }));
}

export type SortKey = 'rate' | 'name' | 'attend';

export function sortStats(rows: AttendanceStat[], key: SortKey): AttendanceStat[] {
  const sorted = [...rows];
  if (key === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  else if (key === 'attend') sorted.sort((a, b) => b.attend_count - a.attend_count);
  else
    sorted.sort(
      (a, b) =>
        Number(b.attendance_rate) - Number(a.attendance_rate) || b.attend_count - a.attend_count
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
