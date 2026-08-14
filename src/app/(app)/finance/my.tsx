import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { Card, EmptyState, InlineLoader, ListRow, Muted, SectionTitle, Screen, ScreenScroll } from '@/components/ui';
import { Colors, Radius, Spacing, Typography, Weight } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { describeDbError } from '@/lib/errors';
import { fetchMyAnnualPayments, fetchMyPayments, formatWon, PAYMENT_STATUS_LABEL } from '@/lib/finance';
import type { AnnualPayment, MembershipPayment, PaymentStatus } from '@/types/database';

const STATUS_COLOR: Record<PaymentStatus, string> = {
  paid: Colors.accent,
  unpaid: Colors.danger,
  exempt: Colors.muted,
};

export default function MyPaymentsScreen() {
  const { profile } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<MembershipPayment[]>([]);
  const [annual, setAnnual] = useState<AnnualPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [monthly, yearly] = await Promise.all([
        fetchMyPayments(profile.id),
        fetchMyAnnualPayments(profile.id),
      ]);
      setRows(monthly);
      setAnnual(yearly);
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [profile, toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // 연납한 해의 월별 기록은 합계·미납에서 뺀다. 연납 등록 시 월납을 면제로
  // 바꾸긴 하지만, 그 전에 남아 있던 기록이 있으면 같은 돈을 두 번 더하게 된다.
  const annualYears = new Set(annual.map((a) => a.year));
  const paidTotal =
    rows
      .filter((r) => r.status === 'paid' && !annualYears.has(r.year))
      .reduce((sum, r) => sum + r.amount, 0) +
    annual.reduce((sum, a) => sum + a.amount, 0);
  const unpaidCount = rows.filter(
    (r) => r.status === 'unpaid' && !annualYears.has(r.year)
  ).length;

  return (
    <Screen>
      <ScreenHeader title="내 회비" subtitle="읽기 전용" onBack={() => router.back()} />

      <ScreenScroll>
        <Card>
          <SectionTitle>납부 합계 {formatWon(paidTotal)}</SectionTitle>
          <Text style={styles.summaryLine}>
            기록 {rows.length}건
            {unpaidCount > 0 ? ` · 미납 ${unpaidCount}건` : ' · 미납 없음'}
          </Text>
          {annual.length > 0 ? (
            <Text style={styles.summaryLine}>
              연납 {annual.map((a) => `${a.year}년`).join(' · ')}
            </Text>
          ) : null}
          <Muted>금액과 상태는 운영진이 입력합니다. 틀린 내용이 있으면 운영진에게 알려주세요.</Muted>
        </Card>

        {annual.length > 0 ? (
          <Card>
            <SectionTitle>연납 내역</SectionTitle>
            <Muted>연초에 한 번에 낸 기록입니다. 그 해 월별 내역은 입력하지 않습니다.</Muted>
            {annual.map((a, index) => (
              <ListRow
                key={a.id}
                first={index === 0}
                title={`${a.year}년 전체`}
                meta={`${a.payment_date ? `납부일 ${a.payment_date}` : '납부일 없음'}${
                  a.memo ? ` · ${a.memo}` : ''
                }`}
                trailing={
                  <View style={styles.rowRight}>
                    <Text style={styles.amount}>{formatWon(a.amount)}</Text>
                    <View style={[styles.badge, { backgroundColor: Colors.navy }]}>
                      <Text style={styles.badgeText}>연납</Text>
                    </View>
                  </View>
                }
              />
            ))}
          </Card>
        ) : null}

        <Card>
          <SectionTitle>월별 내역</SectionTitle>
          {loading ? (
            <InlineLoader spacing="vertical" />
          ) : rows.length === 0 ? (
            <EmptyState message="아직 기록이 없습니다." />
          ) : (
            rows.map((row, index) => (
              <ListRow
                key={row.id}
                first={index === 0}
                title={`${row.year}년 ${row.month}월`}
                meta={`${row.payment_date ? `납부일 ${row.payment_date}` : '납부일 없음'}${
                  row.memo ? ` · ${row.memo}` : ''
                }`}
                trailing={
                  <View style={styles.rowRight}>
                    <Text style={styles.amount}>{formatWon(row.amount)}</Text>
                    <View style={[styles.badge, { backgroundColor: STATUS_COLOR[row.status] }]}>
                      <Text style={styles.badgeText}>{PAYMENT_STATUS_LABEL[row.status]}</Text>
                    </View>
                  </View>
                }
              />
            ))
          )}
        </Card>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryLine: { ...Typography.body, fontWeight: Weight.semibold, color: Colors.text },
  rowRight: { alignItems: 'flex-end', gap: Spacing.half },
  amount: { ...Typography.body, fontWeight: Weight.bold, color: Colors.text },
  badge: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, borderRadius: Radius.sm },
  badgeText: { ...Typography.caption, color: Colors.textOnNavy, fontWeight: Weight.bold },
});
