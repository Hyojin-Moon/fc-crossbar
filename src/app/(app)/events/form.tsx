import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { formatTime, todayLocalISO, toTimeString } from '@/lib/dates';
import { createEvent, fetchEvent, updateEvent, type EventInput } from '@/lib/events';
import { describeDbError } from '@/lib/errors';
import { fetchSeasonSquads, useSeasons, type SeasonSquad } from '@/lib/seasons';
import { MATCH_TYPES, MATCH_TYPE_LABEL, useVenues } from '@/lib/venues';
import type { MatchType } from '@/types/database';

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

function makeDefaults() {
  const now = new Date();
  const nowTime = toTimeString(now);
  const today = todayLocalISO();

  return {
    title: '',
    eventDate: today,
    startTime: '08:00',
    endTime: '10:00',
    matchType: 'regular' as MatchType,
    seasonId: '',
    homeTeamId: '',
    awayTeamId: '',
    venueId: '',
    venueName: '',
    venueAddress: '',
    mapUrl: '',
    description: '',
    voteOpenDate: today,
    voteOpenTime: nowTime,
    voteDeadlineDate: shiftDays(today, 3),
    voteDeadlineTime: nowTime,
    maxAttendees: '',
    includeStats: true,
  };
}

export default function EventFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { profile } = useAuth();
  const toast = useToast();
  const { venues } = useVenues();
  const { seasons } = useSeasons();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(makeDefaults);
  const [squads, setSquads] = useState<SeasonSquad[]>([]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // 유형을 바꿀 때 시즌 관련 값을 정리한다. events_season_match_check 가
  // '시즌경기가 아니면 세 값 모두 null' 을 요구하므로 화면에서만 숨기면 저장이 막힌다.
  const setMatchType = (type: MatchType) =>
    setForm((prev) =>
      type === 'season'
        ? { ...prev, matchType: type }
        : { ...prev, matchType: type, seasonId: '', homeTeamId: '', awayTeamId: '' }
    );

  // 참가 팀은 시즌마다 다르다 — 시즌을 바꾸면 골라둔 팀도 버린다.
  const selectSeason = (seasonId: string) =>
    setForm((prev) =>
      prev.seasonId === seasonId
        ? prev
        : { ...prev, seasonId, homeTeamId: '', awayTeamId: '' }
    );

  useEffect(() => {
    if (!form.seasonId) {
      setSquads([]);
      return;
    }
    void (async () => {
      try {
        setSquads(await fetchSeasonSquads(form.seasonId));
      } catch (e) {
        toast(describeDbError(e), 'error');
      }
    })();
  }, [form.seasonId, toast]);

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
          matchType: event.match_type,
          seasonId: event.season_id ?? '',
          homeTeamId: event.home_team_id ?? '',
          awayTeamId: event.away_team_id ?? '',
          venueId: event.venue_id ?? '',
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

    let voteOpenAt = new Date();
    if (form.voteOpenDate) {
      const parsed = combineLocal(form.voteOpenDate, form.voteOpenTime || '00:00');
      if (!parsed) return '투표 시작 일시를 확인해 주세요.';
      voteOpenAt = parsed;
    }

    const deadlineDate = form.voteDeadlineDate || shiftDays(form.eventDate, -1);
    const deadline = combineLocal(deadlineDate, form.voteDeadlineTime || '18:00');
    if (!deadline) return '투표 마감 일시를 확인해 주세요.';
    if (deadline.getTime() <= voteOpenAt.getTime()) {
      return '투표 마감이 투표 시작보다 빠릅니다.';
    }

    const max = form.maxAttendees.trim();
    if (max && !/^\d+$/.test(max)) return '최대 참석인원은 숫자만 입력해 주세요.';

    const isSeason = form.matchType === 'season';
    if (isSeason) {
      if (!form.seasonId) return '시즌을 골라 주세요.';
      if (!form.homeTeamId || !form.awayTeamId) return '홈 팀과 원정 팀을 모두 골라 주세요.';
      if (form.homeTeamId === form.awayTeamId) return '홈 팀과 원정 팀이 같습니다.';
    }

    return {
      title: form.title.trim(),
      event_date: form.eventDate,
      start_time: form.startTime || null,
      end_time: form.endTime || null,
      match_type: form.matchType,
      season_id: isSeason ? form.seasonId : null,
      home_team_id: isSeason ? form.homeTeamId : null,
      away_team_id: isSeason ? form.awayTeamId : null,
      venue_id: form.venueId || null,
      // 경기장 정보는 '복사'해 저장한다. 나중에 경기장 등록 정보가 바뀌어도
      // 지난 경기 기록은 당시 값을 유지해야 한다.
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
            <View style={styles.field}>
              <Text style={styles.label}>경기 유형</Text>
              <View style={styles.chips}>
                {MATCH_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setMatchType(type)}
                    style={[styles.chip, form.matchType === type && styles.chipActive]}>
                    <Text
                      style={[styles.chipText, form.matchType === type && styles.chipTextActive]}>
                      {MATCH_TYPE_LABEL[type]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {form.matchType === 'season' ? (
              seasons.length === 0 ? (
                <Muted>
                  등록된 시즌이 없습니다. 관리 &gt; 시즌 관리에서 시즌을 먼저 만들어 주세요.
                </Muted>
              ) : (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>시즌</Text>
                    <View style={styles.chips}>
                      {seasons.map((season) => (
                        <Pressable
                          key={season.id}
                          onPress={() => selectSeason(season.id)}
                          style={[styles.chip, form.seasonId === season.id && styles.chipActive]}>
                          <Text
                            style={[
                              styles.chipText,
                              form.seasonId === season.id && styles.chipTextActive,
                            ]}>
                            {season.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {!form.seasonId ? null : squads.length < 2 ? (
                    <Muted>
                      이 시즌의 참가 팀이 2팀 미만입니다. 시즌 관리에서 팀을 추가해 주세요.
                    </Muted>
                  ) : (
                    (
                      [
                        ['홈 팀', 'homeTeamId', 'awayTeamId'],
                        ['원정 팀', 'awayTeamId', 'homeTeamId'],
                      ] as const
                    ).map(([label, key, otherKey]) => (
                      <View key={key} style={styles.field}>
                        <Text style={styles.label}>{label}</Text>
                        <View style={styles.chips}>
                          {squads.map((squad) => {
                            const selected = form[key] === squad.teamId;
                            // 같은 팀끼리 붙일 수 없다 (events_season_match_check)
                            const takenByOther = form[otherKey] === squad.teamId;
                            return (
                              <Pressable
                                key={squad.teamId}
                                disabled={takenByOther}
                                onPress={() => setForm((prev) => ({ ...prev, [key]: squad.teamId }))}
                                style={[
                                  styles.chip,
                                  selected && styles.chipActive,
                                  takenByOther && styles.chipDisabled,
                                ]}>
                                <Text
                                  style={[
                                    styles.chipText,
                                    selected && styles.chipTextActive,
                                    takenByOther && styles.chipTextDisabled,
                                  ]}>
                                  {squad.teamName}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ))
                  )}
                </>
              )
            ) : null}
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
            {venues.length > 0 ? (
              <View style={styles.field}>
                <Text style={styles.label}>등록된 경기장</Text>
                <View style={styles.chips}>
                  {venues.map((venue) => (
                    <Pressable
                      key={venue.id}
                      onPress={() =>
                        setForm((prev) => ({
                          ...prev,
                          venueId: venue.id,
                          venueName: venue.name,
                          venueAddress: venue.address ?? '',
                          mapUrl: venue.map_url ?? prev.mapUrl,
                        }))
                      }
                      style={[styles.chip, form.venueId === venue.id && styles.chipActive]}>
                      <Text
                        style={[
                          styles.chipText,
                          form.venueId === venue.id && styles.chipTextActive,
                        ]}>
                        {venue.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Muted>고르면 주소와 지도 링크가 자동으로 채워집니다.</Muted>
              </View>
            ) : (
              <Muted>등록된 경기장이 없습니다. 관리 &gt; 경기장 관리에서 추가할 수 있습니다.</Muted>
            )}
            <Field
              label="구장명"
              value={form.venueName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, venueName: value, venueId: '' }))}
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
                  hint="기본값: 지금"
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
                  hint="기본값: 3일 뒤"
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
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.textOnNavy },
  chipTextDisabled: { color: Colors.muted },
  pair: { flexDirection: 'row', gap: Spacing.two },
  pairItem: { flex: 1, minWidth: 0 },
  multiline: { minHeight: 84, paddingTop: Spacing.two, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  switchText: { flex: 1, gap: 2 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
});
