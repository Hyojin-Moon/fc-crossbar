import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card, EmptyState, InlineLoader, ListRow, Muted, SectionTitle, Screen, ScreenScroll } from '@/components/ui';
import { Colors, Radius, Spacing, Typography, Weight } from '@/constants/theme';
import { formatEventDate } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import { useAuth } from '@/lib/auth-context';
import {
  fetchExpenses,
  fetchFinanceSummary,
  formatWon,
  type FinanceSummary,
} from '@/lib/finance';
import type { Expense } from '@/types/database';

export default function FinanceDashboardScreen() {
  const { isAdmin } = useAuth();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [recent, setRecent] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [totals, recentExpenses] = await Promise.all([
        fetchFinanceSummary(year, month),
        fetchExpenses(5),
      ]);
      setSummary(totals);
      setRecent(recentExpenses);
      setError(null);
    } catch (e) {
      setError(describeDbError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, month]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <Screen>
      <ScreenHeader title="회비" subtitle={`${year}년 ${month}월`} />
      <ScreenScroll>
        {loading ? (
          <InlineLoader />
        ) : error ? (
          <Card>
            <SectionTitle>불러오지 못했습니다</SectionTitle>
            <Muted>{error}</Muted>
          </Card>
        ) : summary ? (
          <>
            <Card>
              <SectionTitle>현재 잔액</SectionTitle>
              <Text style={[styles.balance, summary.balance < 0 && { color: Colors.danger }]}>
                {formatWon(summary.balance)}
              </Text>
              <Muted>
                총 입금 {formatWon(summary.totalIncome)} − 총 지출 {formatWon(summary.totalExpense)}
              </Muted>
            </Card>

            <View style={styles.tiles}>
              <Tile
                label="이번 달 입금"
                value={formatWon(summary.monthIncome)}
                color={Colors.accent}
              />
              <Tile
                label="이번 달 지출"
                value={formatWon(summary.monthExpense)}
                color={Colors.danger}
              />
              {isAdmin ? (
                <Tile
                  label="이번 달 미납"
                  value={`${summary.unpaidCount}명`}
                  color={summary.unpaidCount > 0 ? Colors.warning : Colors.muted}
                />
              ) : null}
              <Tile
                label="이번 달 수지"
                value={formatWon(summary.monthIncome - summary.monthExpense)}
                color={Colors.navy}
              />
            </View>

            {isAdmin ? (
              <MenuRow
                icon="people"
                title="회비 납부 내역"
                subtitle="월별 회원 납부 상태 관리"
                onPress={() => router.push('/(app)/finance/payments')}
              />
            ) : (
              <MenuRow
                icon="person"
                title="내 회비"
                subtitle="본인 납부 이력"
                onPress={() => router.push('/(app)/finance/my')}
              />
            )}
            <MenuRow
              icon="receipt"
              title="회비 사용 내역"
              subtitle="팀 운영비 지출 기록"
              onPress={() => router.push('/(app)/finance/expenses')}
            />

            <Card>
              <SectionTitle>최근 지출</SectionTitle>
              {recent.length === 0 ? (
                <EmptyState message="지출 기록이 없습니다." />
              ) : (
                recent.map((expense, index) => (
                  <ListRow
                    key={expense.id}
                    first={index === 0}
                    title={expense.description}
                    meta={`${formatEventDate(expense.expense_date)} · ${expense.category}`}
                    trailing={<Text style={styles.expenseAmount}>-{formatWon(expense.amount)}</Text>}
                    onPress={
                      isAdmin
                        ? () => router.push(`/(app)/finance/expense-form?id=${expense.id}`)
                        : undefined
                    }
                  />
                ))
              )}
            </Card>
          </>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={20} color={Colors.navy} />
      </View>
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  balance: { ...Typography.display, fontWeight: Weight.bold, color: Colors.navy },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  tileValue: { ...Typography.title, fontWeight: Weight.bold },
  tileLabel: { ...Typography.caption, color: Colors.textSecondary },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1, gap: Spacing.half },
  menuTitle: { ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.text },
  menuSubtitle: { ...Typography.caption, color: Colors.textSecondary },
  expenseAmount: { ...Typography.body, fontWeight: Weight.bold, color: Colors.danger },
});
