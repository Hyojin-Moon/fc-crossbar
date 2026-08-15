import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { DateTimeInput } from '@/components/datetime-input';
import { ScreenHeader } from '@/components/screen-header';
import { StatTable } from '@/components/stat-table';
import { TrendChart } from '@/components/trend-chart';
import { Card, ChipRow, InlineLoader, Muted, SectionTitle, Screen, ScreenScroll } from '@/components/ui';
import { Colors, Radius, Spacing, Typography, Weight } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { formatEventDate, todayLocalISO } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import {
  fetchMemberStatTotals,
  fetchSeasonStandings,
  pivotStatTotals,
  useStatTypes,
} from '@/lib/match-stats';
import { displayName } from '@/lib/members';
import { useBreakpoint } from '@/lib/responsive';
import {
  fetchSeasonMatches,
  fetchSeasons,
  SEASON_STATUS_LABEL,
  type SeasonMatch,
} from '@/lib/seasons';
import {
  fetchStats,
  PERIOD_LABELS,
  rangeFor,
  sortStats,
  summarizeTeam,
  type PeriodKey,
  type Range,
  type SortKey,
  type StatsPayload,
} from '@/lib/stats';
import { useVoteOptions } from '@/lib/vote-options';
import type { MemberStatTotal, Season, SeasonStanding } from '@/types/database';

const PERIODS: PeriodKey[] = ['recent1m', 'recent3m', 'recent6m', 'thisYear', 'lastYear', 'all', 'custom'];
const PERIOD_ITEMS = PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }));
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rate', label: '참석률' },
  { key: 'attend', label: '참석 수' },
  { key: 'name', label: '이름' },
];

type Panel = 'attendance' | 'season' | 'member';

const PANEL_LABEL: Record<Panel, string> = {
  attendance: '출석',
  season: '시즌',
  member: '개인',
};

export default function StatsScreen() {
  const { profile, isAdmin } = useAuth();
  const options = useVoteOptions();
  const statTypes = useStatTypes();
  const { isWide } = useBreakpoint();

  const [panel, setPanel] = useState<Panel>('attendance');

  // 기간 필터는 출석 · 개인 패널이 함께 쓴다. 시즌 패널은 시즌 자체가 기간이다.
  const [period, setPeriod] = useState<PeriodKey>('recent3m');
  const [customFrom, setCustomFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [customTo, setCustomTo] = useState(todayLocalISO());
  const [sort, setSort] = useState<SortKey>('rate');
  const [statSort, setStatSort] = useState<string>('');

  const [data, setData] = useState<StatsPayload>({ rows: [], trend: [] });
  const [statTotals, setStatTotals] = useState<MemberStatTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- 시즌 패널 --------------------------------------------------------
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  // load 가 seasonId 를 의존성으로 갖으면 setSeasonId 마다 useFocusEffect 가 다시 돌아
  // 화면에 들어올 때마다 같은 질의를 두 번 한다. 값은 ref 로 읽는다.
  const seasonIdRef = useRef<string | null>(null);
  const [standings, setStandings] = useState<SeasonStanding[]>([]);
  // 경기 목록은 '결과 입력 N/M' 을 쓰려고만 읽는다. 목록 자체는 시즌 탭에 있다.
  const [matches, setMatches] = useState<SeasonMatch[]>([]);
  const [seasonStats, setSeasonStats] = useState<MemberStatTotal[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);

  const range: Range = useMemo(
    () => (period === 'custom' ? { from: customFrom, to: customTo } : rangeFor(period)),
    [period, customFrom, customTo]
  );

  const loadSeason = useCallback(async (id: string | null) => {
    if (!id) {
      setStandings([]);
      setMatches([]);
      setSeasonStats([]);
      return;
    }
    const [st, ms, totals] = await Promise.all([
      fetchSeasonStandings(id),
      fetchSeasonMatches(id),
      fetchMemberStatTotals({ seasonId: id }),
    ]);
    setStandings(st);
    setMatches(ms);
    setSeasonStats(totals);
  }, []);

  /** 시즌 목록을 읽고 고르고 있던 시즌(없으면 진행 중 · 최근)의 집계를 가져온다. */
  const loadSeasonPanel = useCallback(async () => {
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
  }, [loadSeason]);

  const load = useCallback(async () => {
    try {
      const [payload, totals] = await Promise.all([
        fetchStats(range, options),
        fetchMemberStatTotals({ from: range.from, to: range.to }),
      ]);
      setData(payload);
      setStatTotals(totals);
      setError(null);
    } catch (e) {
      setError(describeDbError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range, options]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // 시즌 집계는 그 패널을 보고 있을 때만 읽는다 — 출석 화면에서 4개 질의를 낭비하지 않는다.
  // 위 effect 와 나눠 둬야 패널을 옮길 때 기간 집계까지 다시 읽지 않는다.
  useFocusEffect(
    useCallback(() => {
      if (panel !== 'season') return;
      setSeasonLoading(true);
      void loadSeasonPanel()
        .catch((e) => setError(describeDbError(e)))
        .finally(() => setSeasonLoading(false));
    }, [panel, loadSeasonPanel])
  );

  const selectSeason = (id: string) => {
    if (id === seasonId) return;
    seasonIdRef.current = id;
    setSeasonId(id);
    setSeasonLoading(true);
    void loadSeason(id)
      .catch((e) => setError(describeDbError(e)))
      .finally(() => setSeasonLoading(false));
  };

  const summary = summarizeTeam(data.rows);
  const sorted = sortStats(data.rows, sort);
  const mine = profile ? data.rows.find((r) => r.member_id === profile.id) : undefined;

  const memberStatRows = useMemo(() => pivotStatTotals(statTotals), [statTotals]);
  const seasonStatRows = useMemo(() => pivotStatTotals(seasonStats), [seasonStats]);
  // 스탯 항목은 데이터라서 기본 정렬 기준도 런타임에 정해진다
  const sortColumn = statSort || statTypes[0]?.code || 'name';

  const season = seasons.find((s) => s.id === seasonId) ?? null;
  const scored = matches.filter((m) => m.home_score !== null && m.status !== 'cancelled').length;

  const subtitle =
    panel === 'season'
      ? season
        ? `${season.name} · ${SEASON_STATUS_LABEL[season.status]}`
        : '시즌 없음'
      : `${PERIOD_LABELS[period]} · ${panel === 'attendance' ? '실제 출석 기준' : '경기 기록 기준'}`;

  return (
    <Screen>
      <ScreenHeader title="통계" subtitle={subtitle} fullWidth={isWide} />

      <View style={styles.panelBar}>
        {(Object.keys(PANEL_LABEL) as Panel[]).map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityState={{ selected: panel === p }}
            onPress={() => setPanel(p)}
            style={[styles.panelTab, panel === p && styles.panelTabActive]}>
            <Text style={[styles.panelText, panel === p && styles.panelTextActive]}>
              {PANEL_LABEL[p]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* 필터는 화면 상단 한 줄에만 둔다 — 아래 모든 카드가 같은 구간을 본다 */}
      <View style={styles.filterBar}>
        {panel === 'season' ? (
          seasons.length === 0 ? (
            <Text style={styles.filterHint}>등록된 시즌이 없습니다.</Text>
          ) : (
            <ChipRow
              items={seasons.map((s) => ({ value: s.id as string | null, label: s.name }))}
              value={seasonId}
              onChange={(id) => id && selectSeason(id)}
              layout="scroll"
            />
          )
        ) : (
          <>
            <ChipRow
              items={PERIOD_ITEMS}
              value={period}
              onChange={(p) => {
                setPeriod(p);
                setLoading(true);
              }}
              layout="scroll"
            />
            {period === 'custom' ? (
              <View style={styles.customRow}>
                <View style={styles.customItem}>
                  <DateTimeInput label="시작일" mode="date" value={customFrom} onChange={setCustomFrom} />
                </View>
                <View style={styles.customItem}>
                  <DateTimeInput label="종료일" mode="date" value={customTo} onChange={setCustomTo} />
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>

      <ScreenScroll
        fullWidth={isWide}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
              if (panel === 'season') void loadSeasonPanel().catch(() => {});
            }}
            tintColor={Colors.navy}
          />
        }>
        {loading ? (
          <InlineLoader />
        ) : error ? (
          <Card>
            <SectionTitle>불러오지 못했습니다</SectionTitle>
            <Muted>{error}</Muted>
          </Card>
        ) : panel === 'attendance' ? (
          summary.targetEvents === 0 ? (
            <Card>
              <SectionTitle>기간 내 집계할 경기가 없습니다</SectionTitle>
              <Muted>
                지난 경기만 집계합니다. 아직 치르지 않은 일정과 통계 제외로 설정한 일정은 빠집니다.
              </Muted>
            </Card>
          ) : (
            <>
              {summary.recordedEvents === 0 ? (
                <Card>
                  <SectionTitle>아직 출석 기록이 없습니다</SectionTitle>
                  <Muted>
                    참석률은 운영진이 경기 후 기록한 실제 출석(참석 · 지각)으로 계산합니다.
                    일정 상세 화면의 &lsquo;출석 체크&rsquo;에서 기록하면 여기에 반영됩니다.
                  </Muted>
                  <Muted>아래 투표 응답률은 지금도 볼 수 있습니다.</Muted>
                </Card>
              ) : null}

              {mine ? (
                <Card>
                  <SectionTitle>내 참석률</SectionTitle>
                  <View style={styles.heroRow}>
                    <Text style={styles.hero}>{Number(mine.attendance_rate)}%</Text>
                    <Text style={styles.heroSub}>
                      {summary.recordedEvents}경기 중 {mine.present_count + mine.late_count}회 출석
                    </Text>
                  </View>
                  <RateBar value={Number(mine.attendance_rate)} />
                  <Text style={styles.breakdown}>
                    참석 {mine.present_count} · 지각 {mine.late_count} · 불참 {mine.absent_count} ·
                    노쇼 {mine.no_show_count}
                  </Text>
                  <Text style={styles.subMetric}>
                    투표 응답률 {Number(mine.vote_response_rate)}% ({mine.voted_count}/
                    {mine.vote_target_events})
                  </Text>
                </Card>
              ) : null}

              <Card>
                <SectionTitle>팀 전체</SectionTitle>
                <View style={styles.tiles}>
                  <Tile label="평균 참석률" value={`${summary.avgRate}%`} />
                  <Tile label="출석 체크 경기" value={`${summary.recordedEvents}회`} />
                  <Tile label="경기당 평균 출석" value={`${summary.avgAttendees}명`} />
                  <Tile label="회원" value={`${summary.memberCount}명`} />
                </View>
                {summary.top ? (
                  <Text style={styles.topLine}>
                    최고 참석률 · <Text style={styles.topName}>{summary.top.name}</Text>{' '}
                    {Number(summary.top.attendance_rate)}%
                  </Text>
                ) : null}
              </Card>

              <Card>
                <SectionTitle>최근 참석 추세</SectionTitle>
                <TrendChart points={data.trend} />
              </Card>

              <Card>
                <View style={styles.tableHead}>
                  <SectionTitle>회원별</SectionTitle>
                  <View style={styles.sortChips}>
                    {SORTS.map((s) => (
                      <Pressable
                        key={s.key}
                        onPress={() => setSort(s.key)}
                        style={[styles.sortChip, sort === s.key && styles.sortChipActive]}>
                        <Text style={[styles.sortText, sort === s.key && styles.sortTextActive]}>
                          {s.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {sorted.map((row, index) => {
                  const isMe = row.member_id === profile?.id;
                  return (
                    <View key={row.member_id} style={[styles.memberRow, isMe && styles.memberRowMe]}>
                      <View style={styles.memberTop}>
                        <Text style={styles.rank}>{index + 1}</Text>
                        <Text style={[styles.memberName, isMe && styles.memberNameMe]} numberOfLines={1}>
                          {displayName({ id: row.member_id, name: row.name })}
                        </Text>
                        {isMe ? (
                          <View style={styles.meBadge}>
                            <Text style={styles.meBadgeText}>나</Text>
                          </View>
                        ) : null}
                        <Text style={styles.rate}>{Number(row.attendance_rate)}%</Text>
                      </View>
                      <RateBar value={Number(row.attendance_rate)} />
                      <Text style={styles.breakdown}>
                        참석 {row.present_count} · 지각 {row.late_count} · 불참 {row.absent_count} ·
                        노쇼 {row.no_show_count}
                        {row.recorded_events - row.present_count - row.late_count - row.absent_count - row.no_show_count > 0
                          ? ` · 미기록 ${row.recorded_events - row.present_count - row.late_count - row.absent_count - row.no_show_count}`
                          : ''}
                      </Text>
                    </View>
                  );
                })}
              </Card>
            </>
          )
        ) : panel === 'season' ? (
          !season ? (
            <Card>
              <SectionTitle>등록된 시즌이 없습니다</SectionTitle>
              <Muted>
                {isAdmin
                  ? '관리 > 시즌 관리에서 시즌을 만들고 참가 팀·명단을 지정해 주세요.'
                  : '운영진이 시즌을 등록하면 순위와 경기 결과가 여기에 표시됩니다.'}
              </Muted>
              {isAdmin ? (
                <Pressable onPress={() => router.push('/(app)/admin/seasons')}>
                  <Text style={styles.link}>시즌 관리로 이동</Text>
                </Pressable>
              ) : null}
            </Card>
          ) : seasonLoading ? (
            <InlineLoader />
          ) : (
            <>
              <Card>
                <SectionTitle>순위표</SectionTitle>
                <Muted>
                  {formatEventDate(season.start_date)} ~ {formatEventDate(season.end_date)} · 결과 입력{' '}
                  {scored}/{matches.length}경기
                </Muted>
                {standings.length === 0 ? (
                  <Muted>참가 팀이 없습니다. 시즌 관리에서 팀을 추가해 주세요.</Muted>
                ) : (
                  <>
                    {scored === 0 ? (
                      <Muted>아직 결과가 입력된 경기가 없습니다. 스코어를 넣으면 채워집니다.</Muted>
                    ) : null}
                    <View style={styles.tableHeadRow}>
                      <Text style={[styles.cellRank, styles.colHead]}>#</Text>
                      <Text style={[styles.cellTeam, styles.colHead]}>팀</Text>
                      <Text style={[styles.cellNum, styles.colHead]}>경기</Text>
                      <Text style={[styles.cellNum, styles.colHead]}>승</Text>
                      <Text style={[styles.cellNum, styles.colHead]}>무</Text>
                      <Text style={[styles.cellNum, styles.colHead]}>패</Text>
                      <Text style={[styles.cellNum, styles.colHead]}>득실</Text>
                      <Text style={[styles.cellNum, styles.colHead]}>점수</Text>
                    </View>
                    {standings.map((row, i) => (
                      <View key={row.team_id} style={styles.tableRow}>
                        <Text style={[styles.cellRank, styles.cellText]}>{i + 1}</Text>
                        <Text style={[styles.cellTeam, styles.cellTeamText]} numberOfLines={1}>
                          {row.team_name}
                        </Text>
                        <Text style={[styles.cellNum, styles.cellText]}>{row.played}</Text>
                        <Text style={[styles.cellNum, styles.cellText]}>{row.win}</Text>
                        <Text style={[styles.cellNum, styles.cellText]}>{row.draw}</Text>
                        <Text style={[styles.cellNum, styles.cellText]}>{row.loss}</Text>
                        <Text style={[styles.cellNum, styles.cellText]}>
                          {row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}
                        </Text>
                        <Text style={[styles.cellNum, styles.cellPoint]}>{row.points}</Text>
                      </View>
                    ))}
                    <Muted>승 3점 · 무 1점. 결과가 입력된 경기만 셉니다.</Muted>
                    <Muted>참가 팀 명단과 경기 일정은 시즌 탭에 있습니다.</Muted>
                  </>
                )}
              </Card>

              {statTypes.length > 0 && seasonStatRows.length > 0 ? (
                <Card>
                  <SectionTitle>시즌 개인 스탯</SectionTitle>
                  <Muted>열 제목을 누르면 그 항목으로 정렬합니다.</Muted>
                  <StatTable
                    rows={seasonStatRows}
                    types={statTypes}
                    meId={profile?.id}
                    sortBy={sortColumn}
                    onSortChange={setStatSort}
                  />
                </Card>
              ) : null}

              {isAdmin ? (
                <Pressable
                  onPress={() => router.push('/(app)/admin/seasons')}
                  style={({ pressed }) => [styles.adminLink, pressed && { opacity: 0.6 }]}>
                  <Text style={styles.link}>시즌 · 참가 팀 · 명단 관리</Text>
                </Pressable>
              ) : null}
            </>
          )
        ) : (
          <>
            {statTypes.length === 0 ? (
              <Card>
                <SectionTitle>스탯 항목이 없습니다</SectionTitle>
                <Muted>stat_types 테이블에 활성 항목이 없습니다.</Muted>
              </Card>
            ) : memberStatRows.length === 0 ? (
              <Card>
                <SectionTitle>기록된 스탯이 없습니다</SectionTitle>
                <Muted>
                  이 기간에 기록된 개인 스탯이 없습니다. 경기 상세 &gt; 경기 기록에서 입력합니다.
                </Muted>
              </Card>
            ) : (
              <Card>
                <SectionTitle>개인 스탯</SectionTitle>
                <Muted>열 제목을 누르면 그 항목으로 정렬합니다. 기록이 있는 회원만 나옵니다.</Muted>
                <StatTable
                  rows={memberStatRows}
                  types={statTypes}
                  meId={profile?.id}
                  sortBy={sortColumn}
                  onSortChange={setStatSort}
                />
              </Card>
            )}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

/** 단일 측정값의 크기 막대. 값에 따라 색을 바꾸지 않는다 (길이가 이미 크기를 말한다). */
function RateBar({ value }: { value: number }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, value))}%` }]} />
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panelBar: {
    flexDirection: 'row',
    backgroundColor: Colors.navy,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  panelTab: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
    alignItems: 'center',
    backgroundColor: Colors.navySoft,
  },
  panelTabActive: { backgroundColor: Colors.background },
  panelText: { ...Typography.body, fontWeight: Weight.bold, color: '#B9C6D6' },
  panelTextActive: { color: Colors.navy, fontWeight: Weight.bold },
  filterBar: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  filterHint: { ...Typography.caption, color: Colors.textSecondary, paddingHorizontal: Spacing.three },
  customRow: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three },
  customItem: { flex: 1, minWidth: 0 },
  link: { ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.navy },
  adminLink: { alignItems: 'center', paddingVertical: Spacing.two },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  hero: { ...Typography.displayLarge, fontWeight: Weight.bold, color: Colors.navy },
  heroSub: { ...Typography.body, color: Colors.textSecondary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  tileValue: { ...Typography.titleLarge, fontWeight: Weight.bold, color: Colors.text },
  tileLabel: { ...Typography.caption, color: Colors.textSecondary },
  topLine: { ...Typography.body, color: Colors.textSecondary, marginTop: Spacing.one },
  topName: { fontWeight: Weight.bold, color: Colors.text },
  tableHead: { gap: Spacing.two },
  sortChips: { flexDirection: 'row', gap: Spacing.one },
  sortChip: {
    paddingVertical: Spacing.oneHalf,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
  },
  sortChipActive: { backgroundColor: Colors.navySoft },
  sortText: { ...Typography.caption, fontWeight: Weight.semibold, color: Colors.textSecondary },
  sortTextActive: { color: Colors.textOnNavy },
  memberRow: {
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.oneHalf,
  },
  memberRowMe: { backgroundColor: '#F0F6FF', borderRadius: Radius.sm, paddingHorizontal: Spacing.two },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rank: { width: 20, ...Typography.caption, fontWeight: Weight.bold, color: Colors.muted, fontVariant: ['tabular-nums'] },
  memberName: { flex: 1, ...Typography.bodyLarge, fontWeight: Weight.semibold, color: Colors.text },
  memberNameMe: { fontWeight: Weight.bold },
  meBadge: {
    backgroundColor: Colors.navy,
    paddingHorizontal: Spacing.oneHalf,
    paddingVertical: Spacing.half,
    borderRadius: Radius.sm,
  },
  meBadgeText: { ...Typography.micro, color: Colors.textOnNavy, fontWeight: Weight.bold },
  rate: { ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.navy, fontVariant: ['tabular-nums'] },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  breakdown: { ...Typography.caption, color: Colors.textSecondary },
  subMetric: { ...Typography.caption, color: Colors.textSecondary },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.one,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  colHead: { ...Typography.caption, fontWeight: Weight.bold, color: Colors.textSecondary },
  cellText: { ...Typography.body, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  cellTeamText: { ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.text },
  cellPoint: { ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.navy, fontVariant: ['tabular-nums'] },
  cellRank: { width: 20 },
  cellTeam: { flex: 1, minWidth: 0, paddingRight: Spacing.one },
  cellNum: { width: 34, textAlign: 'center' },
});
