import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { DateTimeInput } from '@/components/datetime-input';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { AppButton, Card, Field, FullScreenLoader, Muted, SectionTitle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { formatTime, todayLocalISO } from '@/lib/dates';
import { createEvent, fetchEvent, updateEvent, type EventInput } from '@/lib/events';
import { describeDbError } from '@/lib/errors';

/** 'YYYY-MM-DD' + 'HH:MM' -> 로컬 시각 Date. 형식이 틀리면 null. */
function combineLocal(dateStr: string, timeStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  if (!/^\d{1,2}:\d{2}$/.test(timeStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  if (h > 23 || min > 59) return null;
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function shiftDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export default function EventFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { profile } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    eventDate: todayLocalISO(),
    startTime: '20:00',
    endTime: '22:00',
    venueName: '',
    venueAddress: '',
    mapUrl: '',
    description: '',
    // 비우면 '지금부터' 로 저장한다
    voteOpenDate: '',
    voteOpenTime: '',
    voteDeadlineDate: '',
    voteDeadlineTime: '18:00',
    maxAttendees: '',
    includeStats: true,
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const event = await fetchEvent(id);
        if (!event) {
          toast('일정을 찾을 수 없습니다.', 'error');
          router.back();
          return;
        }
        const openAt = new Date(event.vote_open_at);
        const deadline = event.vote_deadline ? new Date(event.vote_deadline) : null;
        const toDate = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate()
          ).padStart(2, '0')}`;
        const toTime = (d: Date) =>
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

        setForm({
          title: event.title,
          eventDate: event.event_date,
          startTime: formatTime(event.start_time),
          endTime: formatTime(event.end_time),
          venueName: event.venue_name ?? '',
          venueAddress: event.venue_address ?? '',
          mapUrl: event.map_url ?? '',
          description: event.description ?? '',
          voteOpenDate: toDate(openAt),
          voteOpenTime: toTime(openAt),
          voteDeadlineDate: deadline ? toDate(deadline) : '',
          voteDeadlineTime: deadline ? toTime(deadline) : '18:00',
          maxAttendees: event.max_attendees ? String(event.max_attendees) : '',
          includeStats: event.include_attendance_stats,
        });
      } catch (e) {
        toast(describeDbError(e), 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, toast]);

  const buildInput = (): EventInput | string => {
    if (!form.title.trim()) return '제목을 입력해 주세요.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.eventDate)) return '날짜를 YYYY-MM-DD 형식으로 입력해 주세요.';

    for (const [label, value] of [
      ['시작 시간', form.startTime],
      ['종료 시간', form.endTime],
    ] as const) {
      if (value && !/^\d{1,2}:\d{2}$/.test(value)) return `${label}을 HH:MM 형식으로 입력해 주세요.`;
    }

    // 투표 시작: 비어 있으면 지금부터
    let voteOpenAt = new Date();
    if (form.voteOpenDate) {
      const parsed = combineLocal(form.voteOpenDate, form.voteOpenTime || '00:00');
      if (!parsed) return '투표 시작 일시를 확인해 주세요.';
      voteOpenAt = parsed;
    }

    // 투표 마감: 비어 있으면 경기 전날 18:00 을 기본값으로 채운다
    const deadlineDate = form.voteDeadlineDate || shiftDays(form.eventDate, -1);
    const deadline = combineLocal(deadlineDate, form.voteDeadlineTime || '18:00');
    if (!deadline) return '투표 마감 일시를 확인해 주세요.';
    if (deadline.getTime() <= voteOpenAt.getTime()) {
      return '투표 마감이 투표 시작보다 빠릅니다.';
    }

    const max = form.maxAttendees.trim();
    if (max && !/^\d+$/.test(max)) return '최대 참석인원은 숫자만 입력해 주세요.';

    return {
      title: form.title.trim(),
      event_date: form.eventDate,
      start_time: form.startTime || null,
      end_time: form.endTime || null,
      venue_name: form.venueName.trim() || null,
      venue_address: form.venueAddress.trim() || null,
      map_url: form.mapUrl.trim() || null,
      description: form.description.trim() || null,
      vote_open_at: voteOpenAt.toISOString(),
      vote_deadline: deadline.toISOString(),
      max_attendees: max ? Number(max) : null,
      include_attendance_stats: form.includeStats,
    };
  };

  const onSubmit = async () => {
    const built = buildInput();
    if (typeof built === 'string') {
      toast(built, 'error');
      return;
    }
    if (!profile) return;

    setSaving(true);
    try {
      if (id) {
        await updateEvent(id, built);
        toast('일정을 수정했습니다.');
      } else {
        await createEvent(built, profile.id);
        toast('일정을 만들었습니다.');
      }
      router.back();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <FullScreenLoader />;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={isEdit ? '일정 수정' : '새 일정'} subtitle="관리자 전용" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <SectionTitle>기본 정보</SectionTitle>
            <Field
              label="제목"
              value={form.title}
              onChangeText={set('title')}
              placeholder="예) 이번 주 정기전"
            />
            <DateTimeInput
              label="날짜"
              mode="date"
              value={form.eventDate}
              onChange={set('eventDate')}
            />
            <View style={styles.pair}>
              <View style={styles.pairItem}>
                <DateTimeInput
                  label="시작 시간"
                  mode="time"
                  value={form.startTime}
                  onChange={set('startTime')}
                />
              </View>
              <View style={styles.pairItem}>
                <DateTimeInput
                  label="종료 시간"
                  mode="time"
                  value={form.endTime}
                  onChange={set('endTime')}
                />
              </View>
            </View>
          </Card>

          <Card>
            <SectionTitle>장소</SectionTitle>
            <Field
              label="구장명"
              value={form.venueName}
              onChangeText={set('venueName')}
              placeholder="예) 크로스바 풋살파크"
            />
            <Field label="주소" value={form.venueAddress} onChangeText={set('venueAddress')} />
            <Field
              label="지도 링크"
              value={form.mapUrl}
              onChangeText={set('mapUrl')}
              placeholder="선택 · https://map.naver.com/..."
              autoCapitalize="none"
            />
          </Card>

          <Card>
            <SectionTitle>투표</SectionTitle>
            <View style={styles.pair}>
              <View style={styles.pairItem}>
                <DateTimeInput
                  label="투표 시작 날짜"
                  mode="date"
                  value={form.voteOpenDate}
                  onChange={set('voteOpenDate')}
                  hint="비우면 지금부터"
                />
              </View>
              <View style={styles.pairItem}>
                <DateTimeInput
                  label="시작 시각"
                  mode="time"
                  value={form.voteOpenTime}
                  onChange={set('voteOpenTime')}
                />
              </View>
            </View>
            <View style={styles.pair}>
              <View style={styles.pairItem}>
                <DateTimeInput
                  label="투표 마감 날짜"
                  mode="date"
                  value={form.voteDeadlineDate}
                  onChange={set('voteDeadlineDate')}
                  hint="비우면 경기 전날"
                />
              </View>
              <View style={styles.pairItem}>
                <DateTimeInput
                  label="마감 시각"
                  mode="time"
                  value={form.voteDeadlineTime}
                  onChange={set('voteDeadlineTime')}
                />
              </View>
            </View>
            <Field
              label="최대 참석인원"
              value={form.maxAttendees}
              onChangeText={set('maxAttendees')}
              keyboardType="number-pad"
              placeholder="선택 · 예) 22"
            />
          </Card>

          <Card>
            <SectionTitle>기타</SectionTitle>
            <Field
              label="설명"
              value={form.description}
              onChangeText={set('description')}
              placeholder="선택 · 예) 조끼 챙겨오세요"
              multiline
              style={styles.multiline}
            />
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchLabel}>참석률 통계에 포함</Text>
                <Muted>끄면 이 일정은 참석률 계산에서 제외됩니다.</Muted>
              </View>
              <Switch
                value={form.includeStats}
                onValueChange={(v) => setForm((prev) => ({ ...prev, includeStats: v }))}
                trackColor={{ true: Colors.accent, false: Colors.border }}
              />
            </View>
          </Card>

          <AppButton
            label={isEdit ? '수정 저장' : '일정 만들기'}
            onPress={onSubmit}
            loading={saving}
          />
          <AppButton label="취소" variant="ghost" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  pair: { flexDirection: 'row', gap: Spacing.two },
  pairItem: { flex: 1, minWidth: 0 },
  multiline: { minHeight: 84, paddingTop: Spacing.two, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  switchText: { flex: 1, gap: 2 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
});
