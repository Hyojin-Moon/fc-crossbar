import { supabase } from '@/lib/supabase';
import type { Expense, MembershipPayment, PaymentStatus } from '@/types/database';

export const EXPENSE_CATEGORIES = ['구장비', '장비', '음료/간식', '대회 참가비', '기타'] as const;

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: '납부',
  unpaid: '미납',
  exempt: '면제',
};

/** 1,234,000원 형태로. */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

export type FinanceSummary = {
  balance: number;
  totalIncome: number;
  totalExpense: number;
  monthIncome: number;
  monthExpense: number;
  /** 이번 달 미납 회원 수. 일반회원에게는 보여주지 않는다 (남의 미납 사실) */
  unpaidCount: number;
};

/**
 * 회비 요약은 RPC 로 받는다.
 * 일반회원은 RLS 때문에 본인 납부만 조회할 수 있어서 클라이언트에서 잔액을 더할 수 없다.
 * get_finance_summary() 는 SECURITY DEFINER 로 '합계만' 돌려준다 (개인 정보 없음).
 */
export async function fetchFinanceSummary(
  year?: number,
  month?: number
): Promise<FinanceSummary> {
  const { data, error } = await supabase.rpc('get_finance_summary', {
    p_year: year ?? null,
    p_month: month ?? null,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    balance: Number(row?.balance ?? 0),
    totalIncome: Number(row?.total_income ?? 0),
    totalExpense: Number(row?.total_expense ?? 0),
    monthIncome: Number(row?.month_income ?? 0),
    monthExpense: Number(row?.month_expense ?? 0),
    unpaidCount: Number(row?.unpaid_count ?? 0),
  };
}

/** 본인 납부 이력. RLS 가 어차피 본인 것만 돌려주지만 명시적으로 걸러 둔다. */
export async function fetchMyPayments(memberId: string): Promise<MembershipPayment[]> {
  const { data, error } = await supabase
    .from('membership_payments')
    .select('*')
    .eq('member_id', memberId)
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

type PaymentSlim = Pick<MembershipPayment, 'year' | 'month' | 'amount' | 'status'>;
type ExpenseSlim = Pick<Expense, 'expense_date' | 'amount'>;

/**
 * 수입은 status = 'paid' 인 것만 센다.
 * unpaid 의 amount 는 "받아야 할 금액"이고 exempt 는 면제라서 둘 다 입금이 아니다.
 */
export function summarizeFinance(
  payments: PaymentSlim[],
  expenses: ExpenseSlim[],
  year: number,
  month: number
): FinanceSummary {
  let totalIncome = 0;
  let monthIncome = 0;
  let unpaidCount = 0;

  for (const p of payments) {
    const isThisMonth = p.year === year && p.month === month;
    if (p.status === 'paid') {
      totalIncome += p.amount;
      if (isThisMonth) monthIncome += p.amount;
    } else if (p.status === 'unpaid' && isThisMonth) {
      unpaidCount += 1;
    }
  }

  let totalExpense = 0;
  let monthExpense = 0;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  for (const e of expenses) {
    totalExpense += e.amount;
    if (e.expense_date.startsWith(prefix)) monthExpense += e.amount;
  }

  return {
    balance: totalIncome - totalExpense,
    totalIncome,
    totalExpense,
    monthIncome,
    monthExpense,
    unpaidCount,
  };
}

export async function fetchAllPayments(): Promise<PaymentSlim[]> {
  const { data, error } = await supabase
    .from('membership_payments')
    .select('year, month, amount, status');
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllExpenses(): Promise<ExpenseSlim[]> {
  const { data, error } = await supabase.from('expenses').select('expense_date, amount');
  if (error) throw error;
  return data ?? [];
}

export async function fetchMonthPayments(year: number, month: number): Promise<MembershipPayment[]> {
  const { data, error } = await supabase
    .from('membership_payments')
    .select('*')
    .eq('year', year)
    .eq('month', month);
  if (error) throw error;
  return data ?? [];
}

export type PaymentInput = {
  member_id: string;
  year: number;
  month: number;
  amount: number;
  status: PaymentStatus;
  payment_date: string | null;
  memo: string | null;
};

/** (member_id, year, month) UNIQUE 이므로 upsert 로 갱신한다. */
export async function savePayment(input: PaymentInput, createdBy: string) {
  const { error } = await supabase
    .from('membership_payments')
    .upsert({ ...input, created_by: createdBy }, { onConflict: 'member_id,year,month' });
  if (error) throw error;
}

export async function fetchExpenses(limit = 100): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchExpense(id: string): Promise<Expense | null> {
  const { data, error } = await supabase.from('expenses').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export type ExpenseInput = {
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  memo: string | null;
};

export async function createExpense(input: ExpenseInput, createdBy: string) {
  const { error } = await supabase.from('expenses').insert({ ...input, created_by: createdBy });
  if (error) throw error;
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const { error } = await supabase.from('expenses').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}
