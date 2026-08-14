import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { DateTimeInput } from '@/components/datetime-input';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import {
  AppButton,
  Card,
  ChipRow,
  Field,
  FullScreenLoader,
  SectionTitle,
  Screen,
  ScreenScroll,
} from '@/components/ui';
import { Colors, Spacing, Typography, Weight } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { confirmAsync } from '@/lib/confirm';
import { todayLocalISO } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import {
  createExpense,
  deleteExpense,
  EXPENSE_CATEGORIES,
  fetchExpense,
  formatWon,
  updateExpense,
  type ExpenseInput,
} from '@/lib/finance';

const CATEGORY_ITEMS = EXPENSE_CATEGORIES.map((c) => ({ value: c as string, label: c }));

export default function ExpenseFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { profile, isAdmin } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: todayLocalISO(),
    category: EXPENSE_CATEGORIES[0] as string,
    description: '',
    amount: '',
    memo: '',
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const expense = await fetchExpense(id);
        if (!expense) {
          toast('내역을 찾을 수 없습니다.', 'error');
          router.back();
          return;
        }
        setForm({
          date: expense.expense_date,
          category: expense.category,
          description: expense.description,
          amount: String(expense.amount),
          memo: expense.memo ?? '',
        });
      } catch (e) {
        toast(describeDbError(e), 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, toast]);

  const build = (): ExpenseInput | string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return '날짜를 YYYY-MM-DD 형식으로 입력해 주세요.';
    if (!form.description.trim()) return '내용을 입력해 주세요.';
    const amount = form.amount.replace(/[,\s]/g, '');
    if (!/^\d+$/.test(amount)) return '금액은 숫자만 입력해 주세요.';
    if (Number(amount) <= 0) return '금액은 0보다 커야 합니다.';

    return {
      expense_date: form.date,
      category: form.category,
      description: form.description.trim(),
      amount: Number(amount),
      memo: form.memo.trim() || null,
    };
  };

  const onSubmit = async () => {
    const built = build();
    if (typeof built === 'string') {
      toast(built, 'error');
      return;
    }
    if (!profile) return;

    setSaving(true);
    try {
      if (id) {
        await updateExpense(id, built);
        toast('수정했습니다.');
      } else {
        await createExpense(built, profile.id);
        toast('등록했습니다.');
      }
      router.back();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    const ok = await confirmAsync({
      title: '지출 삭제',
      message: '이 지출 내역을 삭제합니다.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;

    setSaving(true);
    try {
      await deleteExpense(id);
      toast('삭제했습니다.');
      router.back();
    } catch (e) {
      toast(describeDbError(e), 'error');
      setSaving(false);
    }
  };

  if (loading) return <FullScreenLoader />;
  // 딥링크로 직접 들어오는 경우 차단. 최종 차단은 RLS 가 담당한다.
  if (!isAdmin) return <Redirect href="/(app)/finance" />;

  const parsedAmount = Number(form.amount.replace(/[,\s]/g, ''));

  return (
    <Screen>
      <ScreenHeader title={isEdit ? '지출 수정' : '지출 등록'} subtitle="관리자 전용" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll>
          <Card>
            <SectionTitle>내용</SectionTitle>
            <DateTimeInput label="날짜" mode="date" value={form.date} onChange={set('date')} />

            <View style={styles.field}>
              <Text style={styles.label}>카테고리</Text>
              <ChipRow items={CATEGORY_ITEMS} value={form.category} onChange={set('category')} layout="wrap" />
            </View>

            <Field
              label="내용"
              value={form.description}
              onChangeText={set('description')}
              placeholder="예) OO축구장 대관"
            />
            <Field
              label="금액"
              value={form.amount}
              onChangeText={set('amount')}
              keyboardType="number-pad"
              placeholder="예) 120000"
              hint={Number.isFinite(parsedAmount) && parsedAmount > 0 ? formatWon(parsedAmount) : undefined}
            />
            <Field
              label="메모"
              value={form.memo}
              onChangeText={set('memo')}
              placeholder="선택"
            />
          </Card>

          <AppButton label={isEdit ? '수정 저장' : '등록'} onPress={onSubmit} loading={saving} />
          {isEdit ? (
            <AppButton
              label="삭제"
              variant="outline"
              color={Colors.danger}
              disabled={saving}
              onPress={() => void onDelete()}
            />
          ) : null}
          <AppButton label="취소" variant="ghost" onPress={() => router.back()} />
        </ScreenScroll>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { gap: Spacing.one },
  label: { ...Typography.body, fontWeight: Weight.semibold, color: Colors.textSecondary },
});
