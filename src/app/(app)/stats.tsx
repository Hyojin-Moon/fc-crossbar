import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DateTimeInput } from '@/components/datetime-input';
import { ScreenHeader } from '@/components/screen-header';
import { TrendChart } from '@/components/trend-chart';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { todayLocalISO } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import { displayName } from '@/lib/members';
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

const PERIODS: PeriodKey[] = ['recent1m', 'recent3m', 'recent6m', 'thisYear', 'lastYear', 'all', 'custom'];
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rate', label: '참석률' },
  { key: 'attend', label: '참석 수' },
  { key: 'name', label: '이름' },
];

export default function StatsScreen() {
  const { profile } = useAuth();
  const options = useVoteOptions();

  const [period, setPeriod] = useState<PeriodKey>('recent3m');
  const [customFrom, setCustomFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [customTo, setCustomTo] = useState(todayLocalISO());
  const [sort, setSort] = useState<SortKey>('rate');

  const [data, setData] = useState<StatsPayload>({ rows: [], trend: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range: Range = useMemo(
    () => (period === 'custom' ? { from: customFrom, to: customTo } : rangeFor(period)),
    [period, customFrom, customTo]
  );

  const load = useCallback(async () => {
    try {
      setData(await fetchStats(range, options));
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

  const summary = summarizeTeam(data.rows);
  const sorted = sortStats(data.rows, sort);
  const mine = profile ? data.rows.find((r) => r.member_id === profile.id) : undefined;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="참석률 통계"
        subtitle={`${PERIOD_LABELS[period]} · 실제 출석 기준`}
      />

      {/* 필터는 한 줄로 모아 두고, 아래 모든 카드가 같은 구간을 본다. */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PERIODS.map((p) => (
            <Pressable
              key={p}
              onPress={() => {
                setPeriod(p);
                setLoading(true);
              }}
              style={[styles.chip, period === p && styles.chipActive]}>
              <Text style={[styles.chipText, period === p && styles.chipTextActive]}>
                {PERIOD_LABELS[p]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
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
      </View>

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
        ) : summary.targetEvents === 0 ? (
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
        )}
      </ScrollView>
    </View>
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
  screen: { flex: 1, backgroundColor: Colors.surface },
  filterBar: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
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
  customRow: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three },
  customItem: { flex: 1, minWidth: 0 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  loader: { marginTop: Spacing.five },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  hero: { fontSize: 40, fontWeight: '800', color: Colors.navy },
  heroSub: { fontSize: 13, color: Colors.textSecondary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.two + 2,
    gap: 2,
  },
  tileValue: { fontSize: 20, fontWeight: '800', color: Colors.text },
  tileLabel: { fontSize: 12, color: Colors.textSecondary },
  topLine: { fontSize: 13, color: Colors.textSecondary, marginTop: Spacing.one },
  topName: { fontWeight: '800', color: Colors.text },
  tableHead: { gap: Spacing.two },
  sortChips: { flexDirection: 'row', gap: Spacing.one },
  sortChip: {
    paddingVertical: 5,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: 999,
    backgroundColor: Colors.surface,
  },
  sortChipActive: { backgroundColor: Colors.navySoft },
  sortText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  sortTextActive: { color: Colors.textOnNavy },
  memberRow: {
    paddingTop: Spacing.two + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 5,
  },
  memberRowMe: { backgroundColor: '#F0F6FF', borderRadius: Radius.sm, paddingHorizontal: Spacing.two },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rank: { width: 20, fontSize: 12, fontWeight: '700', color: Colors.muted, fontVariant: ['tabular-nums'] },
  memberName: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
  memberNameMe: { fontWeight: '800' },
  meBadge: {
    backgroundColor: Colors.navy,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.sm,
  },
  meBadgeText: { color: Colors.textOnNavy, fontSize: 10, fontWeight: '700' },
  rate: { fontSize: 15, fontWeight: '800', color: Colors.navy, fontVariant: ['tabular-nums'] },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  breakdown: { fontSize: 12, color: Colors.textSecondary },
  subMetric: { fontSize: 12, color: Colors.muted },
});
