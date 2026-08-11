import { todayLocalISO } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import type { AttendanceStatus, MatchType, TeamEvent, VoteCode, VoteOption } from '@/types/database';

export type VoteRow = {
  id: string;
  member_id: string;
  vote: VoteCode;
  guest_count: number;
};

export type AttendanceRow = {
  id: string;
  member_id: string;
  status: AttendanceStatus;
};

export type EventWithVotes = TeamEvent & {
  votes: VoteRow[];
  attendance?: AttendanceRow[];
};

/**
 * 투표 창 상태. is_vote_open() SQL 함수와 같은 조건을 쓴다.
 * 화면과 DB 가 다르게 판단하면 "버튼은 눌리는데 저장은 거부되는" 상황이 생긴다.
 */
export type VoteWindow = 'before' | 'open' | 'closed';

export function getVoteWindow(event: TeamEvent, now = Date.now()): VoteWindow {
  if (event.status !== 'open') return 'closed';
  if (new Date(event.vote_open_at).getTime() > now) return 'before';
  if (event.vote_deadline && new Date(event.vote_deadline).getTime() < now) return 'closed';
  return 'open';
}

export const VOTE_WINDOW_LABEL: Record<VoteWindow, string> = {
  before: '투표 시작 전',
  open: '투표 진행 중',
  closed: '투표 마감',
};

/**
 * 코드별 득표수 + 미투표 수.
 * memberIds 에 없는 사람(super_admin, 비활성 회원)의 투표는 세지 않는다 —
 * 그러지 않으면 카드의 인원수와 상세의 명단 길이가 어긋난다.
 */
export type VoteSummary = {
  counts: Record<string, number>;
  noVote: number;
  attendCount: number;
  guestCount: number;
  total: number;
};

export function summarizeVotes(
  votes: VoteRow[],
  options: VoteOption[],
  memberIds: Set<string>
): VoteSummary {
  const counts: Record<string, number> = {};
  for (const o of options) counts[o.code] = 0;

  let attendCount = 0;
  let guestCount = 0;
  const attendanceCodes = new Set(
    options.filter((o) => o.counts_as_attendance).map((o) => o.code)
  );

  let total = 0;
  for (const v of votes) {
    if (!memberIds.has(v.member_id)) continue;
    total += 1;
    counts[v.vote] = (counts[v.vote] ?? 0) + 1;
    if (attendanceCodes.has(v.vote)) attendCount += 1;
    guestCount += v.guest_count;
  }

  return {
    counts,
    noVote: Math.max(0, memberIds.size - total),
    attendCount,
    guestCount,
    total,
  };
}

const EVENT_SELECT =
  '*, votes:event_votes(id, member_id, vote, guest_count), attendance:event_attendance(id, member_id, status)';

export async function fetchUpcomingEvents(): Promise<EventWithVotes[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .gte('event_date', todayLocalISO())
    .neq('status', 'cancelled')
    .order('event_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as EventWithVotes[];
}

export async function fetchPastEvents(limit = 30): Promise<EventWithVotes[]> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .lt('event_date', todayLocalISO())
    .order('event_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as EventWithVotes[];
}

export async function fetchStatsEvents(
  from: string | null,
  to: string | null
): Promise<EventWithVotes[]> {
  const today = todayLocalISO();
  const upperBound = to && to < today ? to : today;

  let query = supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('include_attendance_stats', true)
    .neq('status', 'cancelled')
    .lte('event_date', upperBound)
    .order('event_date', { ascending: true });

  if (from) query = query.gte('event_date', from);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as EventWithVotes[];
}

export async function fetchEvent(id: string): Promise<EventWithVotes | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as EventWithVotes) ?? null;
}

/**
 * 투표 저장. 같은 (event_id, member_id) 가 있으면 갱신한다.
 * RLS 가 INSERT 의 WITH CHECK 와 UPDATE 의 USING/WITH CHECK 를 모두 검사하므로
 * 투표 기간이 아니면 여기서 거부된다.
 */
export async function saveVote(eventId: string, memberId: string, vote: VoteCode) {
  const { error } = await supabase
    .from('event_votes')
    .upsert({ event_id: eventId, member_id: memberId, vote }, { onConflict: 'event_id,member_id' });
  if (error) throw error;
}

export async function deleteVote(eventId: string, memberId: string) {
  const { error } = await supabase
    .from('event_votes')
    .delete()
    .eq('event_id', eventId)
    .eq('member_id', memberId);
  if (error) throw error;
}

export type EventInput = {
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  map_url: string | null;
  match_type: MatchType;
  description: string | null;
  vote_open_at: string;
  vote_deadline: string | null;
  max_attendees: number | null;
  include_attendance_stats: boolean;
};

export async function createEvent(input: EventInput, createdBy: string) {
  const { data, error } = await supabase
    .from('events')
    .insert({ ...input, created_by: createdBy })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateEvent(id: string, input: EventInput) {
  const { error } = await supabase.from('events').update(input).eq('id', id);
  if (error) throw error;
}

/** 투표 마감. vote_deadline 을 건드리지 않고 status 만 바꾼다 (is_vote_open 이 읽는 값). */
export async function setEventStatus(id: string, status: 'open' | 'closed' | 'cancelled') {
  const { error } = await supabase.from('events').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}
