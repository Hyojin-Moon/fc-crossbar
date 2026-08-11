import { ROLE_LABEL, STATUS_LABEL, fetchAllMembers } from '@/lib/admin';
import { buildCsv, csvFilename, saveCsv, type SaveResult } from '@/lib/csv';
import { supabase } from '@/lib/supabase';
import { PAYMENT_STATUS_LABEL } from '@/lib/finance';
import { fetchStats, rangeFor, type PeriodKey } from '@/lib/stats';
import { loadVoteOptions } from '@/lib/vote-options';
import type { Expense, MembershipPayment } from '@/types/database';

export type ExportKind = 'members' | 'payments' | 'expenses' | 'attendance';

export const EXPORT_LABEL: Record<ExportKind, { title: string; description: string }> = {
  members: { title: '회원 목록', description: '아이디 · 이름 · 닉네임 · 권한 · 상태 · 가입일' },
  payments: { title: '회비 납부 내역', description: '회원 · 연월 · 금액 · 상태 · 납부일 · 메모' },
  expenses: { title: '회비 사용 내역', description: '날짜 · 카테고리 · 내용 · 금액 · 메모' },
  attendance: {
    title: '참석률 통계',
    description: '참석 · 지각 · 불참 · 노쇼 · 참석률 · 투표 응답률',
  },
};

/** 회비/통계는 기간에 따라 결과가 달라지므로 어떤 구간을 뽑았는지 파일명에 남긴다. */
function periodSuffix(period: PeriodKey): string {
  const { from, to } = rangeFor(period);
  if (!from && !to) return '전체';
  return `${from ?? ''}_${to ?? ''}`;
}

async function exportMembers(): Promise<SaveResult> {
  const members = await fetchAllMembers();
  const csv = buildCsv(
    ['아이디', '이름', '닉네임', '전화번호', '권한', '상태', '가입일'],
    members.map((m) => [
      m.login_id ?? '',
      m.name,
      m.nickname ?? '',
      m.phone ?? '',
      ROLE_LABEL[m.role],
      STATUS_LABEL[m.status],
      m.created_at.slice(0, 10),
    ])
  );
  return saveCsv(csvFilename('회원목록'), csv);
}

async function exportPayments(): Promise<SaveResult> {
  // 회원 이름을 같이 넣어야 사람이 읽을 수 있다. member_id 만 있으면 쓸모가 없다.
  const [{ data, error }, members] = await Promise.all([
    supabase
      .from('membership_payments')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
    fetchAllMembers(),
  ]);
  if (error) throw error;

  const nameOf = new Map(members.map((m) => [m.id, m]));
  const rows = (data ?? []) as MembershipPayment[];

  const csv = buildCsv(
    ['연도', '월', '아이디', '이름', '금액', '상태', '납부일', '메모'],
    rows.map((p) => {
      const member = nameOf.get(p.member_id);
      return [
        p.year,
        p.month,
        member?.login_id ?? '',
        member?.name ?? '(삭제된 회원)',
        p.amount,
        PAYMENT_STATUS_LABEL[p.status],
        p.payment_date ?? '',
        p.memo ?? '',
      ];
    })
  );
  return saveCsv(csvFilename('회비납부'), csv);
}

async function exportExpenses(): Promise<SaveResult> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Expense[];

  const csv = buildCsv(
    ['날짜', '카테고리', '내용', '금액', '메모'],
    rows.map((e) => [e.expense_date, e.category, e.description, e.amount, e.memo ?? ''])
  );
  return saveCsv(csvFilename('회비사용'), csv);
}

async function exportAttendance(period: PeriodKey): Promise<SaveResult> {
  const options = await loadVoteOptions();
  const { rows } = await fetchStats(rangeFor(period), options);

  const csv = buildCsv(
    [
      '이름',
      '닉네임',
      '참석',
      '지각',
      '불참',
      '노쇼',
      '출석체크 경기',
      '참석률(%)',
      '투표 응답',
      '집계 경기',
      '투표 응답률(%)',
    ],
    rows.map((r) => [
      r.name,
      r.nickname ?? '',
      r.present_count,
      r.late_count,
      r.absent_count,
      r.no_show_count,
      r.recorded_events,
      Number(r.attendance_rate),
      r.voted_count,
      r.vote_target_events,
      Number(r.vote_response_rate),
    ])
  );
  return saveCsv(csvFilename('참석률', periodSuffix(period)), csv);
}

export async function exportCsv(kind: ExportKind, period: PeriodKey = 'all'): Promise<SaveResult> {
  switch (kind) {
    case 'members':
      return exportMembers();
    case 'payments':
      return exportPayments();
    case 'expenses':
      return exportExpenses();
    case 'attendance':
      return exportAttendance(period);
  }
}
