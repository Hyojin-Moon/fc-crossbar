import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { Card, ChipRow, EmptyState, InlineLoader, ListRow, SectionTitle, Screen, ScreenScroll } from '@/components/ui';
import { Colors, Radius, Spacing, Typography, Weight } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { formatEventDate } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import { EXPENSE_CATEGORIES, fetchExpenses, formatWon } from '@/lib/finance';
import type { Expense } from '@/types/database';

export default function ExpensesScreen() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setExpenses(await fetchExpenses(100));
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const filtered = category ? expenses.filter((e) => e.category === category) : expenses;
  const total = filtered.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = EXPENSE_CATEGORIES.map((c) => ({
    category: c as string,
    total: expenses.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.total > 0);

  const chipItems = [
    { value: null, label: '전체' },
    ...EXPENSE_CATEGORIES.map((c) => ({ value: c as string, label: c })),
  ];

  return (
    <Screen>
      <ScreenHeader
        title="회비 사용 내역"
        subtitle={`${filtered.length}건 · ${formatWon(total)}`}
        onBack={() => router.back()}
        right={
          isAdmin ? (
            <Pressable
              accessibilityLabel="새 지출"
              onPress={() => router.push('/(app)/finance/expense-form')}
              style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}>
              <Ionicons name="add" size={20} color={Colors.navy} />
              <Text style={styles.addLabel}>등록</Text>
            </Pressable>
          ) : undefined
        }
      />

      <ChipRow items={chipItems} value={category} onChange={setCategory} bar />

      <ScreenScroll>
        {loading ? (
          <InlineLoader />
        ) : (
          <>
            {byCategory.length > 0 && category === null ? (
              <Card>
                <SectionTitle>카테고리별</SectionTitle>
                {byCategory.map((c) => (
                  <View key={c.category} style={styles.catRow}>
                    <Text style={styles.catName}>{c.category}</Text>
                    <Text style={styles.catTotal}>{formatWon(c.total)}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <Card>
              <SectionTitle>{category ?? '전체'} 내역</SectionTitle>
              {filtered.length === 0 ? (
                <EmptyState message="내역이 없습니다." />
              ) : (
                filtered.map((expense, index) => (
                  <ListRow
                    key={expense.id}
                    first={index === 0}
                    title={expense.description}
                    meta={`${formatEventDate(expense.expense_date)} · ${expense.category}${
                      expense.memo ? ` · ${expense.memo}` : ''
                    }`}
                    trailing={<Text style={styles.amount}>-{formatWon(expense.amount)}</Text>}
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
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    backgroundColor: Colors.background,
    paddingVertical: Spacing.oneHalf,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.sm,
  },
  addLabel: { ...Typography.body, fontWeight: Weight.bold, color: Colors.navy },
  catRow: { flexDirection: 'row', justifyContent: 'space-between' },
  catName: { ...Typography.body, color: Colors.textSecondary },
  catTotal: { ...Typography.body, fontWeight: Weight.bold, color: Colors.text },
  amount: { ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.danger },
});
