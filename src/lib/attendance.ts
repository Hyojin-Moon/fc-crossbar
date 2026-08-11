import { supabase } from '@/lib/supabase';
import type { AttendanceStatus, EventAttendance } from '@/types/database';

/**
 * 실제 출석 기록. 투표(사전 의사)와 다른 사실이다.
 *  - 투표는 회원 본인이, 출석은 운영진이 기록한다
 *  - 노쇼 = 참석한다고 투표했는데 오지 않음. 투표를 덮어쓰면 이 신호가 사라지므로 테이블을 분리했다
 */
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'no_show'];

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: '참석',
  late: '지각',
  absent: '불참',
  no_show: '노쇼',
};

/** 참석률에 포함되는 상태. get_attendance_stats() 와 같은 기준. */
export const COUNTS_AS_ATTENDED: AttendanceStatus[] = ['present', 'late'];

export async function fetchEventAttendance(eventId: string): Promise<EventAttendance[]> {
  const { data, error } = await supabase
    .from('event_attendance')
    .select('*')
    .eq('event_id', eventId);
  if (error) throw error;
  return data ?? [];
}

export async function setAttendance(
  eventId: string,
  memberId: string,
  status: AttendanceStatus,
  recordedBy: string
) {
  const { error } = await supabase.from('event_attendance').upsert(
    { event_id: eventId, member_id: memberId, status, recorded_by: recordedBy },
    { onConflict: 'event_id,member_id' }
  );
  if (error) throw error;
}

export async function clearAttendance(eventId: string, memberId: string) {
  const { error } = await supabase
    .from('event_attendance')
    .delete()
    .eq('event_id', eventId)
    .eq('member_id', memberId);
  if (error) throw error;
}

/**
 * 참석으로 투표한 사람을 '참석'으로 일괄 기록한다.
 * 이미 기록이 있으면 건드리지 않으므로(ON CONFLICT DO NOTHING) 손으로 고친
 * 지각·노쇼가 되돌아가지 않는다. 여러 번 눌러도 안전하다.
 * @returns 새로 만들어진 기록 수
 */
export async function seedAttendanceFromVotes(eventId: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_seed_attendance_from_votes', {
    p_event_id: eventId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export type AttendanceSummary = {
  counts: Record<AttendanceStatus, number>;
  attended: number;
  unrecorded: number;
  recorded: number;
};

/** memberIds 에 없는 사람의 기록은 세지 않는다 (super_admin · 비활성 회원). */
export function summarizeAttendance(
  rows: EventAttendance[],
  memberIds: Set<string>
): AttendanceSummary {
  const counts = { present: 0, late: 0, absent: 0, no_show: 0 } as Record<
    AttendanceStatus,
    number
  >;
  let recorded = 0;
  for (const row of rows) {
    if (!memberIds.has(row.member_id)) continue;
    recorded += 1;
    counts[row.status] += 1;
  }

  return {
    counts,
    attended: counts.present + counts.late,
    recorded,
    unrecorded: Math.max(0, memberIds.size - recorded),
  };
}
