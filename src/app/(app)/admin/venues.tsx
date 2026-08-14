import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import {
  AppButton,
  Card,
  EmptyState,
  Field,
  InlineLoader,
  Muted,
  SectionTitle,
  Screen,
  ScreenScroll,
} from '@/components/ui';
import { Colors, Spacing, Typography, Weight } from '@/constants/theme';
import { confirmAsync } from '@/lib/confirm';
import { describeDbError } from '@/lib/errors';
import { createVenue, deleteVenue, fetchVenues, updateVenue } from '@/lib/venues';
import type { Venue } from '@/types/database';

const EMPTY = { name: '', address: '', mapUrl: '', memo: '' };

export default function VenuesScreen() {
  const toast = useToast();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setVenues(await fetchVenues(true));
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
  };

  const onSubmit = async () => {
    if (!form.name.trim()) {
      toast('경기장 이름을 입력해 주세요.', 'error');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || null,
        map_url: form.mapUrl.trim() || null,
        memo: form.memo.trim() || null,
        is_active: true,
      };
      if (editingId) {
        await updateVenue(editingId, payload);
        toast('수정했습니다.');
      } else {
        await createVenue(payload);
        toast('등록했습니다.');
      }
      reset();
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onToggleActive = async (venue: Venue) => {
    setBusy(true);
    try {
      await updateVenue(venue.id, { is_active: !venue.is_active });
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (venue: Venue) => {
    const ok = await confirmAsync({
      title: '경기장 삭제',
      message: `${venue.name}을(를) 삭제합니다.\n이미 만든 일정의 구장명·주소는 그대로 남습니다.`,
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await deleteVenue(venue.id);
      toast('삭제했습니다.');
      if (editingId === venue.id) reset();
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="경기장 관리"
        subtitle={`${venues.filter((v) => v.is_active).length}곳 사용 중`}
        onBack={() => router.back()}
      />

      <ScreenScroll>
        <Card>
          <SectionTitle>{editingId ? '경기장 수정' : '경기장 등록'}</SectionTitle>
          <Muted>여기 등록해 두면 일정 만들 때 골라서 주소까지 자동 입력됩니다.</Muted>
          <Field
            label="이름"
            value={form.name}
            onChangeText={set('name')}
            placeholder="예) 크로스바 풋살파크"
          />
          <Field
            label="주소"
            value={form.address}
            onChangeText={set('address')}
            placeholder="예) 서울시 ○○구 ○○로 12"
          />
          <Field
            label="지도 링크"
            value={form.mapUrl}
            onChangeText={set('mapUrl')}
            placeholder="선택 · https://map.naver.com/..."
            autoCapitalize="none"
          />
          <Field
            label="메모"
            value={form.memo}
            onChangeText={set('memo')}
            placeholder="선택 · 예) 주차 무료, 조끼 대여 가능"
          />
          <AppButton
            label={editingId ? '수정 저장' : '등록'}
            onPress={() => void onSubmit()}
            loading={busy}
          />
          {editingId ? <AppButton label="취소" variant="ghost" onPress={reset} /> : null}
        </Card>

        <Card>
          <SectionTitle>등록된 경기장</SectionTitle>
          {loading ? (
            <InlineLoader spacing="vertical" />
          ) : venues.length === 0 ? (
            <EmptyState message="아직 등록된 경기장이 없습니다." />
          ) : (
            venues.map((venue) => (
              <View key={venue.id} style={styles.row}>
                <View style={styles.rowTop}>
                  <View style={styles.rowText}>
                    <Text style={[styles.name, !venue.is_active && styles.nameInactive]}>
                      {venue.name}
                    </Text>
                    {venue.address ? <Text style={styles.meta}>{venue.address}</Text> : null}
                    {venue.memo ? <Text style={styles.memo}>{venue.memo}</Text> : null}
                  </View>
                  <Switch
                    value={venue.is_active}
                    disabled={busy}
                    onValueChange={() => void onToggleActive(venue)}
                    trackColor={{ true: Colors.accent, false: Colors.border }}
                  />
                </View>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => {
                      setEditingId(venue.id);
                      setForm({
                        name: venue.name,
                        address: venue.address ?? '',
                        mapUrl: venue.map_url ?? '',
                        memo: venue.memo ?? '',
                      });
                    }}
                    style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
                    <Text style={styles.actionText}>수정</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void onDelete(venue)}
                    style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
                    <Text style={[styles.actionText, { color: Colors.danger }]}>삭제</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
          <Muted>스위치를 끄면 일정 생성 화면의 선택 목록에서 숨겨집니다.</Muted>
        </Card>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.one,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowText: { flex: 1, gap: Spacing.half },
  name: { ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.text },
  nameInactive: { color: Colors.muted, textDecorationLine: 'line-through' },
  meta: { ...Typography.body, color: Colors.textSecondary },
  memo: { ...Typography.caption, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: Spacing.three, paddingBottom: Spacing.two },
  action: { paddingVertical: Spacing.half },
  actionText: { ...Typography.body, fontWeight: Weight.bold, color: Colors.navy },
});
