import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateTimeInput } from '@/components/datetime-input';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { AppButton, Card, Field, Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { confirmAsync } from '@/lib/confirm';
import { formatEventDate, todayLocalISO } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import {
  createSeason,
  deleteSeason,
  fetchSeasons,
  SEASON_STATUS_LABEL,
  SEASON_STATUSES,
} from '@/lib/seasons';
import type { Season, SeasonStatus } from '@/types/database';

const STATUS_COLOR: Record<SeasonStatus, string> = {
  upcoming: Colors.muted,
  active: Colors.accent,
  closed: Colors.navySoft,
};

function emptyForm() {
  const year = new Date().getFullYear();
  return {
    name: '',
    start: todayLocalISO(),
    end: `${year}-12-31`,
    status: 'upcoming' as SeasonStatus,
    memo: '',
  };
}

export default function SeasonsScreen() {
  const { profile } = useAuth();
  const toast = useToast();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    try {
      setSeasons(await fetchSeasons());
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

  const set = (key: keyof ReturnType<typeof emptyForm>) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const reset = () => setForm(emptyForm());

  const onSubmit = async () => {
    if (!profile) return;
    if (!form.name.trim()) {
      toast('시즌 이름을 입력해 주세요.', 'error');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.start) || !/^\d{4}-\d{2}-\d{2}$/.test(form.end)) {
      toast('기간을 YYYY-MM-DD 형식으로 입력해 주세요.', 'error');
      return;
    }
    if (form.end < form.start) {
      toast('종료일이 시작일보다 빠릅니다.', 'error');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        start_date: form.start,
        end_date: form.end,
        status: form.status,
        memo: form.memo.trim() || null,
      };
      const id = await createSeason(payload, profile.id);
      toast('시즌을 만들었습니다.');
      reset();
      await load();
      router.push(`/(app)/admin/season-roster?id=${id}`);
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (season: Season) => {
    const ok = await confirmAsync({
      title: '시즌 삭제',
      message: `${season.name}을(를) 삭제합니다.\n참가 팀과 명단도 함께 사라집니다. 이 시즌으로 등록한 경기는 남지만 시즌 연결이 끊깁니다.`,
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await deleteSeason(season.id);
      toast('삭제했습니다.');
        await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="시즌 관리"
        subtitle={`${seasons.length}개`}
        right={
          <Pressable
            accessibilityLabel="뒤로"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={20} color={Colors.textOnNavy} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionTitle>새 시즌</SectionTitle>
          <Muted>
            만들면 바로 상세로 이동합니다. 상태 변경 · 이름 · 기간 수정은 상세에서 합니다.
          </Muted>
          <Field
            label="이름"
            value={form.name}
            onChangeText={set('name')}
            placeholder="예) 2026 상반기 리그"
          />
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <DateTimeInput label="시작일" mode="date" value={form.start} onChange={set('start')} />
            </View>
            <View style={styles.pairItem}>
              <DateTimeInput label="종료일" mode="date" value={form.end} onChange={set('end')} />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>상태</Text>
            <View style={styles.chips}>
              {SEASON_STATUSES.map((st) => (
                <Pressable
                  key={st}
                  onPress={() => setForm((prev) => ({ ...prev, status: st }))}
                  style={[styles.chip, form.status === st && styles.chipActive]}>
                  <Text style={[styles.chipText, form.status === st && styles.chipTextActive]}>
                    {SEASON_STATUS_LABEL[st]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Field label="메모" value={form.memo} onChangeText={set('memo')} placeholder="선택" />
          <AppButton label="만들고 명단 지정" onPress={() => void onSubmit()} loading={busy} />
        </Card>

        <Card>
          <SectionTitle>시즌 목록</SectionTitle>
          {loading ? (
            <ActivityIndicator color={Colors.navy} style={styles.loader} />
          ) : seasons.length === 0 ? (
            <Muted>아직 시즌이 없습니다.</Muted>
          ) : (
            seasons.map((season) => (
              <View key={season.id} style={styles.row}>
                <Pressable
                  onPress={() => router.push(`/(app)/admin/season-roster?id=${season.id}`)}
                  style={({ pressed }) => [styles.rowHead, pressed && { opacity: 0.7 }]}>
                  <View style={[styles.dot, { backgroundColor: STATUS_COLOR[season.status] }]} />
                  <View style={styles.rowText}>
                    <Text style={styles.name}>{season.name}</Text>
                    <Text style={styles.meta}>
                      {formatEventDate(season.start_date)} ~ {formatEventDate(season.end_date)} ·{' '}
                      {SEASON_STATUS_LABEL[season.status]}
                    </Text>
                    {season.memo ? <Text style={styles.memo}>{season.memo}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
                </Pressable>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => router.push(`/(app)/admin/season-roster?id=${season.id}`)}
                    style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
                    <Text style={styles.actionText}>상태 · 명단</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void onDelete(season)}
                    style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
                    <Text style={[styles.actionText, { color: Colors.danger }]}>삭제</Text>
                  </Pressable>
                </View>
              </View>
            ))
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
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  loader: { marginVertical: Spacing.four },
  pair: { flexDirection: 'row', gap: Spacing.two },
  pairItem: { flex: 1, minWidth: 0 },
  field: { gap: Spacing.one },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.textOnNavy },
  row: { borderTopWidth: 1, borderTopColor: Colors.border },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two + 2,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  memo: { fontSize: 12, color: Colors.muted },
  actions: { flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.two },
  action: { paddingVertical: 2 },
  actionText: { fontSize: 13, fontWeight: '700', color: Colors.navy },
});
