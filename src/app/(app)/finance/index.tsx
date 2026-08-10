import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatEventDate } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import {
  fetchAllExpenses,
  fetchAllPayments,
  fetchExpenses,
  formatWon,
  summarizeFinance,
  type FinanceSummary,
} from '@/lib/finance';
import type { Expense } from '@/types/database';

export default function FinanceDashboardScreen() {
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
      const [payments, expenses, recentExpenses] = await Promise.all([
        fetchAllPayments(),
        fetchAllExpenses(),
        fetchExpenses(5),
      ]);
      setSummary(summarizeFinance(payments, expenses, year, month));
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
    <View style={styles.screen}>
      <ScreenHeader title="회비" subtitle={`${year}년 ${month}월 · 관리자 전용`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={Colors.navy}
          />
        }>
        {loading ? (
          <ActivityIndicator color={Colors.navy} style={styles.loader} />
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
              <Tile
                label="이번 달 미납"
                value={`${summary.unpaidCount}명`}
                color={summary.unpaidCount > 0 ? Colors.warning : Colors.muted}
              />
              <Tile
                label="이번 달 수지"
                value={formatWon(summary.monthIncome - summary.monthExpense)}
                color={Colors.navy}
              />
            </View>

            <MenuRow
              icon="people"
              title="회비 납부 내역"
              subtitle="월별 회원 납부 상태 관리"
              onPress={() => router.push('/(app)/finance/payments')}
            />
            <MenuRow
              icon="receipt"
              title="회비 사용 내역"
              subtitle="팀 운영비 지출 기록"
              onPress={() => router.push('/(app)/finance/expenses')}
            />

            <Card>
              <SectionTitle>최근 지출</SectionTitle>
              {recent.length === 0 ? (
                <Muted>지출 기록이 없습니다.</Muted>
              ) : (
                recent.map((expense) => (
                  <Pressable
                    key={expense.id}
                    onPress={() => router.push(`/(app)/finance/expense-form?id=${expense.id}`)}
                    style={({ pressed }) => [styles.expenseRow, pressed && { opacity: 0.7 }]}>
                    <View style={styles.expenseMain}>
                      <Text style={styles.expenseDesc} numberOfLines={1}>
                        {expense.description}
                      </Text>
                      <Text style={styles.expenseMeta}>
                        {formatEventDate(expense.expense_date)} · {expense.category}
                      </Text>
                    </View>
                    <Text style={styles.expenseAmount}>-{formatWon(expense.amount)}</Text>
                  </Pressable>
                ))
              )}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
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
  screen: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  loader: { marginTop: Spacing.five },
  balance: { fontSize: 34, fontWeight: '800', color: Colors.navy },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: 2,
  },
  tileValue: { fontSize: 18, fontWeight: '800' },
  tileLabel: { fontSize: 12, color: Colors.textSecondary },
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
  menuText: { flex: 1, gap: 2 },
  menuTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  menuSubtitle: { fontSize: 12, color: Colors.textSecondary },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  expenseMain: { flex: 1, gap: 2 },
  expenseDesc: { fontSize: 14, fontWeight: '600', color: Colors.text },
  expenseMeta: { fontSize: 12, color: Colors.textSecondary },
  expenseAmount: { fontSize: 14, fontWeight: '700', color: Colors.danger },
});
