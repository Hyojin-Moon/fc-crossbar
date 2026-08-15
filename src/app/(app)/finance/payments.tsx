import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { Card, InlineLoader, Muted, SectionTitle, Screen, ScreenScroll, SegmentedControl } from '@/components/ui';
import { Colors, MaxContentWidth, Radius, Spacing, Typography, Weight } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { todayLocalISO } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import { confirmAsync } from '@/lib/confirm';
import { useBreakpoint } from '@/lib/responsive';
import {
  countPaidMonths,
  deleteAnnualPayment,
  exemptMonthsForAnnual,
  fetchAnnualPayments,
  fetchMonthPayments,
  formatWon,
  PAYMENT_STATUS_LABEL,
  savePayment,
  saveAnnualPayment,
} from '@/lib/finance';
import { displayName, useActiveMembers } from '@/lib/members';
import { useSettings } from '@/lib/settings';
import type { AnnualPayment, MembershipPayment, PaymentStatus } from '@/types/database';

const STATUSES: PaymentStatus[] = ['paid', 'unpaid', 'exempt'];
const STATUS_COLOR: Record<PaymentStatus, string> = {
  paid: Colors.accent,
  unpaid: Colors.danger,
  exempt: Colors.muted,
};
const STATUS_OPTIONS = STATUSES.map((s) => ({
  value: s,
  label: PAYMENT_STATUS_LABEL[s],
  color: STATUS_COLOR[s],
}));

export default function PaymentsScreen() {
  const { profile, isAdmin } = useAuth();
  const { members } = useActiveMembers();
  const settings = useSettings();
  const toast = useToast();
  const { isWide } = useBreakpoint();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [payments, setPayments] = useState<MembershipPayment[]>([]);
  const [annual, setAnnual] = useState<AnnualPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [monthly, yearly] = await Promise.all([
        fetchMonthPayments(year, month),
        fetchAnnualPayments(year),
      ]);
      setPayments(monthly);
      setAnnual(yearly);
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [year, month, toast]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  // 딥링크로 직접 들어오는 경우 차단. 최종 차단은 RLS 가 담당한다.
  if (!isAdmin) return <Redirect href="/(app)/finance" />;

  const byMember = new Map(payments.map((p) => [p.member_id, p]));
  const annualByMember = new Map(annual.map((a) => [a.member_id, a]));

  const toggleAnnual = async (memberId: string, name: string) => {
    if (!profile || pendingId) return;
    const existing = annualByMember.get(memberId);

    if (existing) {
      const ok = await confirmAsync({
        title: '연납 취소',
        message: `${name}의 ${year}년 연납 기록을 지웁니다.\n연납 등록 때 면제로 바꾼 월납은 그대로 남습니다 — 필요하면 다시 납부로 고쳐 주세요.`,
        confirmLabel: '지우기',
        destructive: true,
      });
      if (!ok) return;

      setPendingId(memberId);
      try {
        await deleteAnnualPayment(memberId, year);
        toast('연납 기록을 지웠습니다.');
        await load();
      } catch (e) {
        toast(describeDbError(e), 'error');
      } finally {
        setPendingId(null);
      }
      return;
    }

    // 이미 납부로 찍힌 달이 있으면 그대로 두면 안 된다 —
    // 회비 요약은 '모든 월납 + 모든 연납' 을 수입으로 더한다.
    let paidMonths = 0;
    try {
      paidMonths = await countPaidMonths(memberId, year);
    } catch (e) {
      toast(describeDbError(e), 'error');
      return;
    }

    const ok = await confirmAsync({
      title: '연납 등록',
      message:
        `${name}이(가) ${year}년 회비 ${formatWon(settings.annualFeeAmount)}을 한 번에 낸 것으로 기록합니다.\n` +
        `이 회원은 ${year}년 월별 미납 집계에서 제외됩니다.` +
        (paidMonths > 0
          ? `\n\n이미 납부로 기록된 ${paidMonths}개월은 '면제'로 바꿉니다. 그대로 두면 같은 돈이 수입에 두 번 잡힙니다.`
          : ''),
      confirmLabel: '등록',
    });
    if (!ok) return;

    setPendingId(memberId);
    try {
      await saveAnnualPayment(
        {
          member_id: memberId,
          year,
          amount: settings.annualFeeAmount,
          payment_date: todayLocalISO(),
          memo: null,
        },
        profile.id
      );
      const changed = await exemptMonthsForAnnual(memberId, year);
      toast(
        changed > 0 ? `연납 등록 · 기존 ${changed}개월을 면제로 바꿨습니다.` : '연납으로 등록했습니다.'
      );
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setPendingId(null);
    }
  };

  const setStatus = async (memberId: string, status: PaymentStatus) => {
    if (!profile || pendingId) return;
    const existing = byMember.get(memberId);
    setPendingId(memberId);

    // 낙관적 갱신: 버튼이 즉시 반응하도록
    const optimistic: MembershipPayment = {
      ...(existing ?? {
        id: `temp-${memberId}`,
        member_id: memberId,
        year,
        month,
        memo: null,
        created_by: profile.id,
        created_at: '',
        updated_at: '',
        amount: settings.monthlyFeeAmount,
        payment_date: null,
        status: 'unpaid',
      }),
      status,
      amount: existing?.amount ?? settings.monthlyFeeAmount,
      payment_date: status === 'paid' ? existing?.payment_date ?? todayLocalISO() : null,
    };
    setPayments((prev) => {
      const rest = prev.filter((p) => p.member_id !== memberId);
      return [...rest, optimistic];
    });

    try {
      await savePayment(
        {
          member_id: memberId,
          year,
          month,
          amount: optimistic.amount,
          status,
          payment_date: optimistic.payment_date,
          memo: optimistic.memo,
        },
        profile.id
      );
      toast(`${PAYMENT_STATUS_LABEL[status]}으로 저장되었습니다.`);
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
      await load();
    } finally {
      setPendingId(null);
    }
  };

  // 연납자는 월별 집계에서 빼야 한다 — get_finance_summary() 도 같은 기준이다.
  const monthlyMembers = members.filter((m) => !annualByMember.has(m.id));
  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = monthlyMembers.filter((m) => byMember.get(m.id)?.status === s).length;
    return acc;
  }, {});
  const notSet = monthlyMembers.length - STATUSES.reduce((sum, s) => sum + counts[s], 0);
  const collected = monthlyMembers.reduce((sum, m) => {
    const p = byMember.get(m.id);
    return p?.status === 'paid' ? sum + p.amount : sum;
  }, 0);
  const annualTotal = annual
    .filter((a) => members.some((m) => m.id === a.member_id))
    .reduce((sum, a) => sum + a.amount, 0);

  return (
    <Screen>
      <ScreenHeader
        title="회비 납부"
        subtitle={`월 ${formatWon(settings.monthlyFeeAmount)} 기준`}
        onBack={() => router.back()}
        fullWidth={isWide}
      />

      <View style={styles.monthBar}>
        <Pressable onPress={() => shiftMonth(-1)} style={styles.monthArrow} accessibilityLabel="이전 달">
          <Ionicons name="chevron-back" size={20} color={Colors.navy} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {year}년 {month}월
        </Text>
        <Pressable onPress={() => shiftMonth(1)} style={styles.monthArrow} accessibilityLabel="다음 달">
          <Ionicons name="chevron-forward" size={20} color={Colors.navy} />
        </Pressable>
      </View>

      <ScreenScroll fullWidth={isWide}>
        <Card>
          <SectionTitle>{formatWon(collected)} 수납</SectionTitle>
          <Text style={styles.summaryLine}>
            납부 {counts.paid} · 미납 {counts.unpaid} · 면제 {counts.exempt}
            {notSet > 0 ? ` · 미입력 ${notSet}` : ''}
          </Text>
          {annual.length > 0 ? (
            <Text style={styles.summaryLine}>
              {year}년 연납 {annual.length}명 · {formatWon(annualTotal)} (월별 집계에서 제외)
            </Text>
          ) : null}
          <Muted>연 {formatWon(settings.annualFeeAmount)} 일괄 납부는 이름 옆 버튼으로 등록합니다.</Muted>
        </Card>

        <Card>
          <SectionTitle>회원별</SectionTitle>
          <Muted>버튼을 누르면 바로 저장됩니다.</Muted>
          {loading ? (
            <InlineLoader spacing="vertical" />
          ) : (
            <View style={isWide && styles.grid}>
            {members.map((member) => {
              const payment = byMember.get(member.id);
              const annualPaid = annualByMember.get(member.id);
              return (
                <View key={member.id} style={isWide && styles.col}>
                <View style={[styles.row, isWide && styles.rowWide]}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {displayName(member)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: Boolean(annualPaid) }}
                      disabled={pendingId !== null}
                      onPress={() => void toggleAnnual(member.id, displayName(member))}
                      style={({ pressed }) => [
                        styles.annualButton,
                        annualPaid && styles.annualButtonOn,
                        pendingId !== null && { opacity: 0.5 },
                        pressed && { opacity: 0.7 },
                      ]}>
                      <Text style={[styles.annualText, annualPaid && styles.annualTextOn]}>
                        {annualPaid ? `${year} 연납` : '연납 등록'}
                      </Text>
                    </Pressable>
                    <Text style={styles.amount}>
                      {annualPaid ? formatWon(annualPaid.amount) : payment ? formatWon(payment.amount) : '-'}
                    </Text>
                  </View>

                  {annualPaid ? (
                    <Text style={styles.dateLine}>
                      {year}년 일괄 납부
                      {annualPaid.payment_date ? ` · ${annualPaid.payment_date}` : ''} · 월별 입력 불필요
                    </Text>
                  ) : null}

                  <SegmentedControl
                    options={STATUS_OPTIONS}
                    value={payment?.status ?? null}
                    // 연납자에게 월납까지 찍으면 같은 돈이 두 번 수입으로 잡힌다
                    disabled={pendingId !== null || Boolean(annualPaid)}
                    dimmed={Boolean(annualPaid)}
                    onChange={(status) => void setStatus(member.id, status)}
                  />
                  {payment?.payment_date ? (
                    <Text style={styles.dateLine}>납부일 {payment.payment_date}</Text>
                  ) : null}
                </View>
                </View>
              );
            })}
            </View>
          )}
        </Card>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.two,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  monthArrow: { padding: Spacing.two },
  monthLabel: { ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.text, minWidth: 120, textAlign: 'center' },
  summaryLine: { ...Typography.body, color: Colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  col: { flexGrow: 1, flexBasis: '48%', minWidth: 0, maxWidth: MaxContentWidth },
  row: {
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.one,
  },
  rowWide: { borderTopWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1, ...Typography.bodyLarge, fontWeight: Weight.semibold, color: Colors.text },
  amount: { ...Typography.body, fontWeight: Weight.bold, color: Colors.textSecondary },
  annualButton: {
    paddingVertical: Spacing.oneHalf,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.navy,
    backgroundColor: Colors.background,
  },
  annualButtonOn: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  annualText: { ...Typography.caption, fontWeight: Weight.bold, color: Colors.navy },
  annualTextOn: { color: Colors.textOnNavy },
  dateLine: { ...Typography.caption, color: Colors.textSecondary },
});
