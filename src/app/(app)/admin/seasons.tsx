import { router, useFocusEffect } from 'expo-router';
import { Fragment, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateTimeInput } from '@/components/datetime-input';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import {
  AppButton,
  Card,
  ChipRow,
  EmptyState,
  Field,
  InlineLoader,
  ListRow,
  Muted,
  SectionTitle,
  Screen,
  ScreenScroll,
} from '@/components/ui';
import { Colors, Spacing, Typography, Weight } from '@/constants/theme';
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

const STATUS_ITEMS = SEASON_STATUSES.map((st) => ({ value: st, label: SEASON_STATUS_LABEL[st] }));

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
    <Screen>
      <ScreenHeader title="시즌 관리" subtitle={`${seasons.length}개`} onBack={() => router.back()} />

      <ScreenScroll>
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
            <ChipRow
              items={STATUS_ITEMS}
              value={form.status}
              onChange={(status) => setForm((prev) => ({ ...prev, status }))}
              layout="wrap"
            />
          </View>

          <Field label="메모" value={form.memo} onChangeText={set('memo')} placeholder="선택" />
          <AppButton label="만들고 명단 지정" onPress={() => void onSubmit()} loading={busy} />
        </Card>

        <Card>
          <SectionTitle>시즌 목록</SectionTitle>
          {loading ? (
            <InlineLoader spacing="vertical" />
          ) : seasons.length === 0 ? (
            <EmptyState message="아직 시즌이 없습니다." />
          ) : (
            seasons.map((season, index) => (
              <Fragment key={season.id}>
                <ListRow
                  first={index === 0}
                  dotColor={STATUS_COLOR[season.status]}
                  title={season.name}
                  meta={`${formatEventDate(season.start_date)} ~ ${formatEventDate(season.end_date)} · ${
                    SEASON_STATUS_LABEL[season.status]
                  }${season.memo ? ` · ${season.memo}` : ''}`}
                  onPress={() => router.push(`/(app)/admin/season-roster?id=${season.id}`)}
                />
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
              </Fragment>
            ))
          )}
        </Card>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: Spacing.two },
  pairItem: { flex: 1, minWidth: 0 },
  field: { gap: Spacing.one },
  label: { ...Typography.body, fontWeight: Weight.semibold, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.two },
  action: { paddingVertical: Spacing.half },
  actionText: { ...Typography.body, fontWeight: Weight.bold, color: Colors.navy },
});
