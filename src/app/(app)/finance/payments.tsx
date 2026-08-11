import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { todayLocalISO } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import {
  fetchMonthPayments,
  formatWon,
  PAYMENT_STATUS_LABEL,
  savePayment,
} from '@/lib/finance';
import { displayName, useActiveMembers } from '@/lib/members';
import { useSettings } from '@/lib/settings';
import type { MembershipPayment, PaymentStatus } from '@/types/database';

const STATUSES: PaymentStatus[] = ['paid', 'unpaid', 'exempt'];
const STATUS_COLOR: Record<PaymentStatus, string> = {
  paid: Colors.accent,
  unpaid: Colors.danger,
  exempt: Colors.muted,
};

export default function PaymentsScreen() {
  const { profile, isAdmin } = useAuth();
  const { members } = useActiveMembers();
  const settings = useSettings();
  const toast = useToast();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [payments, setPayments] = useState<MembershipPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPayments(await fetchMonthPayments(year, month));
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

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = members.filter((m) => byMember.get(m.id)?.status === s).length;
    return acc;
  }, {});
  const notSet = members.length - STATUSES.reduce((sum, s) => sum + counts[s], 0);
  const collected = members.reduce((sum, m) => {
    const p = byMember.get(m.id);
    return p?.status === 'paid' ? sum + p.amount : sum;
  }, 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="회비 납부"
        subtitle={`월 ${formatWon(settings.monthlyFeeAmount)} 기준`}
        right={
          <Pressable
            accessibilityLabel="뒤로"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={20} color={Colors.textOnNavy} />
          </Pressable>
        }
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

      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <SectionTitle>{formatWon(collected)} 수납</SectionTitle>
          <Text style={styles.summaryLine}>
            납부 {counts.paid} · 미납 {counts.unpaid} · 면제 {counts.exempt}
            {notSet > 0 ? ` · 미입력 ${notSet}` : ''}
          </Text>
        </Card>

        <Card>
          <SectionTitle>회원별</SectionTitle>
          <Muted>버튼을 누르면 바로 저장됩니다.</Muted>
          {loading ? (
            <ActivityIndicator color={Colors.navy} style={styles.loader} />
          ) : (
            members.map((member) => {
              const payment = byMember.get(member.id);
              return (
                <View key={member.id} style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {displayName(member)}
                    </Text>
                    <Text style={styles.amount}>
                      {payment ? formatWon(payment.amount) : '-'}
                    </Text>
                  </View>
                  <View style={styles.statusRow}>
                    {STATUSES.map((status) => {
                      const selected = payment?.status === status;
                      const color = STATUS_COLOR[status];
                      return (
                        <Pressable
                          key={status}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => void setStatus(member.id, status)}
                          disabled={pendingId !== null}
                          style={({ pressed }) => [
                            styles.statusButton,
                            selected
                              ? { backgroundColor: color, borderColor: color }
                              : { borderColor: color },
                            pendingId !== null && { opacity: 0.5 },
                            pressed && { opacity: 0.7 },
                          ]}>
                          <Text
                            style={[
                              styles.statusText,
                              { color: selected ? '#FFFFFF' : color },
                            ]}>
                            {PAYMENT_STATUS_LABEL[status]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {payment?.payment_date ? (
                    <Text style={styles.dateLine}>납부일 {payment.payment_date}</Text>
                  ) : null}
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  monthLabel: { fontSize: 16, fontWeight: '800', color: Colors.text, minWidth: 120, textAlign: 'center' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  loader: { marginVertical: Spacing.four },
  summaryLine: { fontSize: 13, color: Colors.textSecondary },
  row: {
    paddingTop: Spacing.two + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.one,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
  amount: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  statusRow: { flexDirection: 'row', gap: Spacing.two },
  statusButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: { fontSize: 14, fontWeight: '700' },
  dateLine: { fontSize: 11, color: Colors.muted },
});
