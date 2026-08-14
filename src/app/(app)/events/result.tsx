import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import {
  AppButton,
  Card,
  ChipRow,
  FullScreenLoader,
  ListRow,
  Muted,
  SectionTitle,
  Screen,
  ScreenScroll,
} from '@/components/ui';
import { Colors, Radius, Spacing, Typography, Weight } from '@/constants/theme';
import { fetchEventAttendance } from '@/lib/attendance';
import { useAuth } from '@/lib/auth-context';
import { formatEventDateLong } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import { fetchEvent, type EventWithVotes } from '@/lib/events';
import {
  fetchEventStats,
  fetchStatTypes,
  saveMatchScore,
  setEventStat,
} from '@/lib/match-stats';
import { displayName, useActiveMembers } from '@/lib/members';
import { fetchSeasonSquads, type SeasonSquad } from '@/lib/seasons';
import { useVoteOptions } from '@/lib/vote-options';
import type { MemberMatchStat, StatType } from '@/types/database';

/** `member_id:stat_type` → value. 화면에서 즉시 반영하려고 평평하게 들고 있는다. */
function keyOf(memberId: string, statType: string) {
  return `${memberId}:${statType}`;
}

export default function MatchResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isAdmin } = useAuth();
  const { members } = useActiveMembers();
  const voteOptions = useVoteOptions();
  const toast = useToast();

  const [event, setEvent] = useState<EventWithVotes | null>(null);
  const [squads, setSquads] = useState<SeasonSquad[]>([]);
  const [statTypes, setStatTypes] = useState<StatType[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [attended, setAttended] = useState<Set<string>>(new Set());
  const [votedAttend, setVotedAttend] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [activeType, setActiveType] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const applyStats = (rows: MemberMatchStat[]) => {
    const next: Record<string, number> = {};
    for (const row of rows) next[keyOf(row.member_id, row.stat_type)] = row.value;
    setValues(next);
    // 명단에 계속 붙잡아 둘 사람. 0으로 내렸다고 목록에서 사라지면 되돌릴 수 없다.
    setPinned((prev) => new Set([...prev, ...rows.map((r) => r.member_id)]));
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [ev, stats, types, attendance] = await Promise.all([
        fetchEvent(id),
        fetchEventStats(id),
        fetchStatTypes(),
        fetchEventAttendance(id),
      ]);
      setEvent(ev);
      applyStats(stats);
      setStatTypes(types);
      setActiveType((prev) => prev ?? types[0]?.code ?? null);
      setHome(ev?.home_score === null || ev?.home_score === undefined ? '' : String(ev.home_score));
      setAway(ev?.away_score === null || ev?.away_score === undefined ? '' : String(ev.away_score));
      setAttended(
        new Set(
          attendance.filter((a) => a.status === 'present' || a.status === 'late').map((a) => a.member_id)
        )
      );
      // 참석률 집계 기준은 vote_options.counts_as_attendance 다 — 코드를 하드코딩하지 않는다
      const attendCodes = new Set(
        voteOptions.filter((o) => o.counts_as_attendance).map((o) => o.code)
      );
      setVotedAttend(
        new Set((ev?.votes ?? []).filter((v) => attendCodes.has(v.vote)).map((v) => v.member_id))
      );
      if (ev?.season_id) setSquads(await fetchSeasonSquads(ev.season_id));
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast, voteOptions]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamName = useMemo(() => new Map(squads.map((s) => [s.teamId, s.teamName])), [squads]);

  /**
   * 스탯은 경기에 나온 사람에게만 붙는다. 명단 우선순위:
   *   1) 출석 기록의 참석 · 지각      (경기 후 운영진이 기록한 사실)
   *   2) 없으면 참석으로 투표한 사람  (출석 체크 전에 결과를 먼저 넣는 경우)
   * `showAll` 을 켜면 전체 명부를 본다 — 투표도 출석 기록도 없는데 나온 사람용 탈출구.
   * 이미 스탯이 있는 사람은 어느 경우에도 남는다 (기록을 고칠 수 있어야 한다).
   */
  const attendSource: 'attendance' | 'vote' | 'none' =
    attended.size > 0 ? 'attendance' : votedAttend.size > 0 ? 'vote' : 'none';

  const roster = useMemo(() => {
    if (showAll) return members;
    const base = attended.size > 0 ? attended : votedAttend;
    if (base.size === 0 && pinned.size === 0) return [];
    return members.filter((m) => base.has(m.id) || pinned.has(m.id));
  }, [members, attended, votedAttend, pinned, showAll]);

  if (loading) return <FullScreenLoader />;

  if (!event) {
    return (
      <Screen>
        <ScreenHeader title="경기 기록" />
        <ScreenScroll>
          <Card>
            <SectionTitle>일정을 찾을 수 없습니다</SectionTitle>
            <AppButton label="뒤로" variant="outline" onPress={() => router.back()} />
          </Card>
        </ScreenScroll>
      </Screen>
    );
  }

  const isSeasonMatch = event.match_type === 'season' && Boolean(event.season_id);

  const onSaveScore = async () => {
    if (busy) return;
    const h = home.trim();
    const a = away.trim();
    // events_score_check: 둘 다 비었거나 둘 다 값이 있어야 한다
    if ((h === '') !== (a === '')) {
      toast('두 팀 점수를 모두 입력하거나 모두 비워 주세요.', 'error');
      return;
    }
    if (h !== '' && (!/^\d+$/.test(h) || !/^\d+$/.test(a))) {
      toast('점수는 숫자만 입력해 주세요.', 'error');
      return;
    }

    setBusy(true);
    try {
      await saveMatchScore(event.id, h === '' ? null : Number(h), a === '' ? null : Number(a));
      toast(h === '' ? '점수를 지웠습니다.' : '점수를 저장했습니다.');
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const bump = async (memberId: string, type: StatType, delta: number) => {
    if (!profile || busy) return;
    const key = keyOf(memberId, type.code);
    const current = values[key] ?? 0;
    const next = type.is_countable ? Math.max(0, current + delta) : current > 0 ? 0 : 1;
    if (next === current) return;

    setBusy(true);
    // 낙관적 반영 — 실패하면 서버 값으로 되돌린다
    setValues((prev) => ({ ...prev, [key]: next }));
    setPinned((prev) => new Set(prev).add(memberId));
    try {
      await setEventStat({
        eventId: event.id,
        memberId,
        statType: type.code,
        value: next,
        recordedBy: profile.id,
      });
    } catch (e) {
      toast(describeDbError(e), 'error');
      applyStats(await fetchEventStats(event.id));
    } finally {
      setBusy(false);
    }
  };

  const type = statTypes.find((t) => t.code === activeType) ?? null;
  const recorded = roster.filter((m) => (values[keyOf(m.id, type?.code ?? '')] ?? 0) > 0).length;

  return (
    <Screen>
      <ScreenHeader
        title="경기 기록"
        subtitle={`${event.title} · ${formatEventDateLong(event.event_date)}`}
        onBack={() => router.back()}
      />

      <ScreenScroll>
        {!isAdmin ? (
          <Card>
            <SectionTitle>권한이 없습니다</SectionTitle>
            <Muted>경기 기록은 운영진만 할 수 있습니다.</Muted>
          </Card>
        ) : (
          <>
            {isSeasonMatch ? (
              <Card>
                <SectionTitle>스코어</SectionTitle>
                <Muted>점수를 넣어야 시즌 순위에 반영됩니다. 승 3점 · 무 1점.</Muted>
                <View style={styles.scoreRow}>
                  <View style={styles.scoreSide}>
                    <Text style={styles.scoreTeam} numberOfLines={1}>
                      {teamName.get(event.home_team_id ?? '') ?? '홈'}
                    </Text>
                    <TextInput
                      value={home}
                      onChangeText={setHome}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={Colors.muted}
                      style={styles.scoreInput}
                    />
                  </View>
                  <Text style={styles.colon}>:</Text>
                  <View style={styles.scoreSide}>
                    <Text style={styles.scoreTeam} numberOfLines={1}>
                      {teamName.get(event.away_team_id ?? '') ?? '원정'}
                    </Text>
                    <TextInput
                      value={away}
                      onChangeText={setAway}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={Colors.muted}
                      style={styles.scoreInput}
                    />
                  </View>
                </View>
                <AppButton label="스코어 저장" loading={busy} onPress={() => void onSaveScore()} />
                <Muted>두 칸을 모두 비우고 저장하면 결과를 지웁니다.</Muted>
              </Card>
            ) : null}

            {statTypes.length === 0 || !type ? (
              <Card>
                <SectionTitle>스탯 항목이 없습니다</SectionTitle>
                <Muted>stat_types 테이블에 활성 항목이 없습니다.</Muted>
              </Card>
            ) : (
              <Card>
                <SectionTitle>개인 스탯</SectionTitle>
                <ChipRow
                  items={statTypes.map((t) => ({ value: t.code, label: t.label }))}
                  value={activeType}
                  onChange={setActiveType}
                  layout="scroll"
                />

                <View style={styles.rosterBar}>
                  <Text style={styles.rosterNote}>
                    {type.label} · {recorded}명 기록 ·{' '}
                    {showAll
                      ? '전체 명부'
                      : attendSource === 'attendance'
                        ? `참석·지각 ${attended.size}명`
                        : attendSource === 'vote'
                          ? `참석 투표 ${votedAttend.size}명`
                          : '참석자 없음'}
                  </Text>
                  <Pressable
                    onPress={() => setShowAll((v) => !v)}
                    style={({ pressed }) => [styles.rosterToggle, pressed && { opacity: 0.6 }]}>
                    <Text style={styles.rosterToggleText}>
                      {showAll ? '참석자만' : '전체 명부'}
                    </Text>
                  </Pressable>
                </View>

                {attendSource === 'vote' && !showAll ? (
                  <Muted>
                    아직 출석 체크를 하지 않아 참석으로 투표한 회원을 보여줍니다. 출석 체크를 먼저
                    하면 실제로 나온 사람만 남습니다.
                  </Muted>
                ) : null}

                {roster.length === 0 ? (
                  <>
                    <Muted>
                      이 경기의 참석자가 없습니다. 출석 체크에서 참석·지각을 기록하면 여기에
                      나타납니다.
                    </Muted>
                    <AppButton
                      label="출석 체크로 이동"
                      variant="outline"
                      onPress={() => router.push(`/(app)/events/attendance?id=${event.id}`)}
                    />
                  </>
                ) : (
                  roster.map((member, index) => {
                    const value = values[keyOf(member.id, type.code)] ?? 0;
                    return (
                      <ListRow
                        key={member.id}
                        first={index === 0}
                        title={displayName(member)}
                        trailing={
                          type.is_countable ? (
                            <View style={styles.stepper}>
                              <Pressable
                                accessibilityLabel={`${displayName(member)} ${type.label} 줄이기`}
                                disabled={busy || value === 0}
                                onPress={() => void bump(member.id, type, -1)}
                                style={({ pressed }) => [
                                  styles.stepButton,
                                  (busy || value === 0) && { opacity: 0.35 },
                                  pressed && { opacity: 0.6 },
                                ]}>
                                <Ionicons name="remove" size={18} color={Colors.navy} />
                              </Pressable>
                              <Text style={[styles.value, value > 0 && styles.valueOn]}>{value}</Text>
                              <Pressable
                                accessibilityLabel={`${displayName(member)} ${type.label} 늘리기`}
                                disabled={busy}
                                onPress={() => void bump(member.id, type, 1)}
                                style={({ pressed }) => [
                                  styles.stepButton,
                                  busy && { opacity: 0.35 },
                                  pressed && { opacity: 0.6 },
                                ]}>
                                <Ionicons name="add" size={18} color={Colors.navy} />
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ selected: value > 0 }}
                              disabled={busy}
                              onPress={() => void bump(member.id, type, 1)}
                              style={({ pressed }) => [
                                styles.toggle,
                                value > 0 && styles.toggleOn,
                                busy && { opacity: 0.5 },
                                pressed && { opacity: 0.7 },
                              ]}>
                              <Text style={[styles.toggleText, value > 0 && styles.toggleTextOn]}>
                                {value > 0 ? '선정됨' : '선정'}
                              </Text>
                            </Pressable>
                          )
                        }
                      />
                    );
                  })
                )}
              </Card>
            )}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  scoreSide: { flex: 1, minWidth: 0, gap: Spacing.one },
  scoreTeam: { ...Typography.body, fontWeight: Weight.bold, color: Colors.textSecondary, textAlign: 'center' },
  scoreInput: {
    minWidth: 0,
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background,
    textAlign: 'center',
    ...Typography.titleLarge,
    fontWeight: Weight.bold,
    color: Colors.text,
  },
  colon: { ...Typography.title, fontWeight: Weight.bold, color: Colors.muted, paddingBottom: Spacing.three },
  rosterBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rosterNote: { flex: 1, minWidth: 0, ...Typography.caption, color: Colors.textSecondary },
  rosterToggle: {
    paddingVertical: Spacing.oneHalf,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rosterToggleText: { ...Typography.caption, fontWeight: Weight.bold, color: Colors.navy },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.navy,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { minWidth: 26, textAlign: 'center', ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.muted },
  valueOn: { color: Colors.navy, fontWeight: Weight.bold },
  toggle: {
    minHeight: 38,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  toggleText: { ...Typography.body, fontWeight: Weight.bold, color: Colors.accent },
  toggleTextOn: { color: Colors.textOnNavy },
});
