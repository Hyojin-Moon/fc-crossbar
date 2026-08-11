import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
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
import { AppButton, Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { formatEventDate, formatTime } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import {
  fetchSeasonMatches,
  fetchSeasonSquads,
  fetchSeasons,
  SEASON_STATUS_LABEL,
  type SeasonMatch,
  type SeasonSquad,
} from '@/lib/seasons';
import type { Season } from '@/types/database';

/**
 * 시즌 '구성' 화면 — 참가 팀 · 명단 · 경기 일정.
 * 순위표와 개인 스탯은 통계 탭에 있다 (숫자는 한 곳에서만 본다).
 */
export default function SeasonScreen() {
  const { isAdmin } = useAuth();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  // load 가 seasonId 를 의존성으로 갖으면 setSeasonId 마다 useFocusEffect 가 다시 돌아
  // 화면에 들어올 때마다 같은 질의를 두 번 한다. 값은 ref 로 읽는다.
  const seasonIdRef = useRef<string | null>(null);

  const [matches, setMatches] = useState<SeasonMatch[]>([]);
  const [squads, setSquads] = useState<SeasonSquad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSeason = useCallback(async (id: string | null) => {
    if (!id) {
      setMatches([]);
      setSquads([]);
      return;
    }
    const [ms, sq] = await Promise.all([fetchSeasonMatches(id), fetchSeasonSquads(id)]);
    setMatches(ms);
    setSquads(sq);
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await fetchSeasons();
      setSeasons(list);

      const current = seasonIdRef.current;
      const target =
        (current && list.some((s) => s.id === current) ? current : null) ??
        list.find((s) => s.status === 'active')?.id ??
        list[0]?.id ??
        null;
      seasonIdRef.current = target;
      setSeasonId(target);
      await loadSeason(target);
      setError(null);
    } catch (e) {
      setError(describeDbError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadSeason]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const selectSeason = (id: string) => {
    if (id === seasonId) return;
    seasonIdRef.current = id;
    setSeasonId(id);
    setLoading(true);
    void loadSeason(id)
      .catch((e) => setError(describeDbError(e)))
      .finally(() => setLoading(false));
  };

  const season = seasons.find((s) => s.id === seasonId) ?? null;
  const teamName = useMemo(() => new Map(squads.map((s) => [s.teamId, s.teamName])), [squads]);
  const assigned = squads.reduce((sum, s) => sum + s.members.length, 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="시즌"
        subtitle={season ? `${season.name} · ${SEASON_STATUS_LABEL[season.status]}` : '시즌 없음'}
        right={
          isAdmin ? (
            <Pressable
              accessibilityLabel="시즌 관리"
              onPress={() => router.push('/(app)/admin/seasons')}
              style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.7 }]}>
              <Ionicons name="settings-outline" size={18} color={Colors.textOnNavy} />
            </Pressable>
          ) : undefined
        }
      />

      {seasons.length > 1 ? (
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {seasons.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => selectSeason(s.id)}
                style={[styles.chip, s.id === seasonId && styles.chipActive]}>
                <Text style={[styles.chipText, s.id === seasonId && styles.chipTextActive]}>
                  {s.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

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
        ) : !season ? (
          <Card>
            <SectionTitle>등록된 시즌이 없습니다</SectionTitle>
            <Muted>
              {isAdmin
                ? '시즌을 만들고 참가 팀과 명단을 지정하면 시즌 경기를 등록할 수 있습니다.'
                : '운영진이 시즌을 등록하면 참가 팀과 경기 일정이 여기에 표시됩니다.'}
            </Muted>
            {isAdmin ? (
              <AppButton
                label="시즌 만들기"
                onPress={() => router.push('/(app)/admin/seasons')}
              />
            ) : null}
          </Card>
        ) : (
          <>
            <Card>
              <SectionTitle>{season.name}</SectionTitle>
              <Muted>
                {formatEventDate(season.start_date)} ~ {formatEventDate(season.end_date)} ·{' '}
                {SEASON_STATUS_LABEL[season.status]}
              </Muted>
              {season.memo ? <Text style={styles.memo}>{season.memo}</Text> : null}
              <Text style={styles.counts}>
                참가 {squads.length}팀 · 배정 {assigned}명 · 경기 {matches.length}
              </Text>
              <Pressable onPress={() => router.push('/(app)/stats')}>
                <Text style={styles.link}>순위표 · 개인 스탯은 통계 탭에서 →</Text>
              </Pressable>
            </Card>

            <Card>
              <SectionTitle>참가 팀 · 명단</SectionTitle>
              {squads.length === 0 ? (
                <Muted>
                  {isAdmin
                    ? '참가 팀이 없습니다. 우측 상단 설정에서 팀을 추가해 주세요.'
                    : '아직 참가 팀이 지정되지 않았습니다.'}
                </Muted>
              ) : (
                squads.map((squad) => (
                  <View key={squad.seasonTeamId} style={styles.squad}>
                    <View style={styles.squadHead}>
                      <View
                        style={[styles.swatch, { backgroundColor: squad.color ?? Colors.navySoft }]}
                      />
                      <Text style={styles.squadName}>{squad.teamName}</Text>
                      <Text style={styles.squadCount}>{squad.members.length}명</Text>
                    </View>
                    <Text style={styles.squadMembers}>
                      {squad.members.length === 0
                        ? '배정된 회원이 없습니다.'
                        : squad.members.map((m) => m.name).join(' · ')}
                    </Text>
                  </View>
                ))
              )}
              {isAdmin && squads.length > 0 ? (
                <AppButton
                  label="참가 팀 · 명단 편성"
                  variant="outline"
                  onPress={() => router.push(`/(app)/admin/season-roster?id=${season.id}`)}
                />
              ) : null}
            </Card>

            <Card>
              <SectionTitle>경기 일정 {matches.length}</SectionTitle>
              {matches.length === 0 ? (
                <Muted>
                  {isAdmin
                    ? '홈 화면 ‘새 일정’에서 경기 유형을 시즌경기로 만들면 여기에 쌓입니다.'
                    : '등록된 시즌 경기가 없습니다.'}
                </Muted>
              ) : (
                matches.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => router.push(`/(app)/events/${m.id}`)}
                    style={({ pressed }) => [styles.matchRow, pressed && { opacity: 0.7 }]}>
                    <View style={styles.matchDateBox}>
                      <Text style={styles.matchDate}>{formatEventDate(m.event_date)}</Text>
                      {m.start_time ? (
                        <Text style={styles.matchTime}>{formatTime(m.start_time)}</Text>
                      ) : null}
                    </View>
                    <View style={styles.matchMain}>
                      <Text style={styles.matchTeams} numberOfLines={1}>
                        {teamName.get(m.home_team_id ?? '') ?? '?'} vs{' '}
                        {teamName.get(m.away_team_id ?? '') ?? '?'}
                      </Text>
                      {m.venue_name ? (
                        <Text style={styles.matchVenue} numberOfLines={1}>
                          {m.venue_name}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={[styles.matchScore, m.home_score === null && styles.matchScoreEmpty]}>
                      {m.status === 'cancelled'
                        ? '취소'
                        : m.home_score === null
                          ? '예정'
                          : `${m.home_score} : ${m.away_score}`}
                    </Text>
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
  headerButton: {
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
    paddingVertical: 7,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.textOnNavy },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  loader: { marginTop: Spacing.five },
  memo: { fontSize: 13, color: Colors.textSecondary },
  counts: { fontSize: 14, fontWeight: '700', color: Colors.text },
  link: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  squad: { paddingTop: Spacing.two, borderTopWidth: 1, borderTopColor: Colors.border, gap: 4 },
  squadHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 11, height: 11, borderRadius: 3 },
  squadName: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.text },
  squadCount: { fontSize: 12, fontWeight: '700', color: Colors.navy },
  squadMembers: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  matchDateBox: { width: 62 },
  matchDate: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  matchTime: { fontSize: 11, color: Colors.muted },
  matchMain: { flex: 1, minWidth: 0, gap: 2 },
  matchTeams: { fontSize: 14, fontWeight: '700', color: Colors.text },
  matchVenue: { fontSize: 12, color: Colors.textSecondary },
  matchScore: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.navy,
    fontVariant: ['tabular-nums'],
  },
  matchScoreEmpty: { fontSize: 12, fontWeight: '600', color: Colors.muted },
});
