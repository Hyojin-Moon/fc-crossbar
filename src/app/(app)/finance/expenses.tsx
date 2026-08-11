import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
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

  // 카테고리별 합계 (전체 목록 기준)
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({
    category: c as string,
    total: expenses.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.total > 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="회비 사용 내역"
        subtitle={`${filtered.length}건 · ${formatWon(total)}`}
        right={
          <View style={styles.headerActions}>
            {isAdmin ? (
              <Pressable
                accessibilityLabel="새 지출"
                onPress={() => router.push('/(app)/finance/expense-form')}
                style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}>
                <Ionicons name="add" size={20} color={Colors.navy} />
                <Text style={styles.addLabel}>등록</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel="뒤로"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
              <Ionicons name="close" size={20} color={Colors.textOnNavy} />
            </Pressable>
          </View>
        }
      />

      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable
            onPress={() => setCategory(null)}
            style={[styles.chip, category === null && styles.chipActive]}>
            <Text style={[styles.chipText, category === null && styles.chipTextActive]}>전체</Text>
          </Pressable>
          {EXPENSE_CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.chip, category === c && styles.chipActive]}>
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={Colors.navy} style={styles.loader} />
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
                <Muted>내역이 없습니다.</Muted>
              ) : (
                filtered.map((expense) => (
                  <Pressable
                    key={expense.id}
                    disabled={!isAdmin}
                    onPress={() => router.push(`/(app)/finance/expense-form?id=${expense.id}`)}
                    style={({ pressed }) => [styles.row, pressed && isAdmin && { opacity: 0.7 }]}>
                    <View style={styles.rowMain}>
                      <Text style={styles.desc} numberOfLines={1}>
                        {expense.description}
                      </Text>
                      <Text style={styles.meta}>
                        {formatEventDate(expense.expense_date)} · {expense.category}
                        {expense.memo ? ` · ${expense.memo}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.amount}>-{formatWon(expense.amount)}</Text>
                  </Pressable>
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.background,
    paddingVertical: 6,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.sm,
  },
  addLabel: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.two,
  },
  chips: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.textOnNavy },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  loader: { marginTop: Spacing.five },
  catRow: { flexDirection: 'row', justifyContent: 'space-between' },
  catName: { fontSize: 14, color: Colors.textSecondary },
  catTotal: { fontSize: 14, fontWeight: '700', color: Colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rowMain: { flex: 1, gap: 2 },
  desc: { fontSize: 15, fontWeight: '600', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  amount: { fontSize: 15, fontWeight: '700', color: Colors.danger },
});
