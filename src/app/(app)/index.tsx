import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { Card, Muted, SectionTitle } from '@/components/ui';
import { VoteCard } from '@/components/vote-card';
import { Colors, Radius, Spacing, VoteColors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { formatEventDate, formatTimeRange, relativeDayLabel } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import {
  fetchPastEvents,
  fetchUpcomingEvents,
  getVoteWindow,
  summarizeVotes,
  VOTE_WINDOW_LABEL,
  type EventWithVotes,
} from '@/lib/events';
import { useActiveMembers } from '@/lib/members';
import { useSettings } from '@/lib/settings';
import { MATCH_TYPE_LABEL } from '@/lib/venues';
import { optionsForEvent, useVoteOptions } from '@/lib/vote-options';

type ListTab = 'upcoming' | 'past';

export default function HomeScreen() {
  const { profile, isAdmin } = useAuth();
  const { memberIds } = useActiveMembers();
  const settings = useSettings();
  const options = useVoteOptions();

  const [tab, setTab] = useState<ListTab>('upcoming');
  const [upcoming, setUpcoming] = useState<EventWithVotes[]>([]);
  const [past, setPast] = useState<EventWithVotes[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [next, recent] = await Promise.all([fetchUpcomingEvents(), fetchPastEvents(50)]);
      setUpcoming(next);
      setPast(recent);
      setError(null);
    } catch (e) {
      setError(describeDbError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // 투표할 수 있는(또는 곧 열리는) 일정만 카드로 크게 띄운다
  const votable = upcoming.filter((e) => getVoteWindow(e) !== 'closed');
  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={settings.teamName}
        subtitle={`${profile?.name ?? ''}님, 반갑습니다`}
        right={
          isAdmin ? (
            <Pressable
              accessibilityLabel="새 일정 만들기"
              onPress={() => router.push('/(app)/events/form')}
              style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}>
              <Ionicons name="add" size={20} color={Colors.navy} />
              <Text style={styles.addLabel}>새 일정</Text>
            </Pressable>
          ) : undefined
        }
      />

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
            <Muted>아래로 당겨서 다시 시도해 주세요.</Muted>
          </Card>
        ) : (
          <>
            {votable.length > 0 && profile ? (
              votable.map((event) => (
                <VoteCard
                  key={event.id}
                  event={event}
                  memberId={profile.id}
                  memberIds={memberIds}
                  onChanged={load}
                  onPressDetail={() => router.push(`/(app)/events/${event.id}`)}
                />
              ))
            ) : (
              <Card>
                <SectionTitle>예정된 투표가 없습니다</SectionTitle>
                <Muted>
                  {isAdmin
                    ? '우측 상단 ‘새 일정’으로 만들 수 있습니다.'
                    : '새 일정이 등록되면 여기에 표시됩니다.'}
                </Muted>
              </Card>
            )}

            <View style={styles.tabs}>
              {(['upcoming', 'past'] as ListTab[]).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={[styles.tab, tab === t && styles.tabActive]}>
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                    {t === 'upcoming' ? `예정 ${upcoming.length}` : `지난 경기 ${past.length}`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {list.length === 0 ? (
              <Card>
                <Muted>
                  {tab === 'upcoming' ? '예정된 일정이 없습니다.' : '지난 경기가 없습니다.'}
                </Muted>
              </Card>
            ) : (
              list.map((event) => {
                const summary = summarizeVotes(event.votes, options, memberIds);
                const window = getVoteWindow(event);
                const myVote = profile
                  ? event.votes.find((v) => v.member_id === profile.id)?.vote ?? null
                  : null;

                return (
                  <Pressable
                    key={event.id}
                    onPress={() => router.push(`/(app)/events/${event.id}`)}
                    style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}>
                    <View style={styles.itemTop}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {event.title}
                      </Text>
                      <Text style={styles.itemDay}>{relativeDayLabel(event.event_date)}</Text>
                    </View>

                    <Text style={styles.itemMeta}>
                      {MATCH_TYPE_LABEL[event.match_type]} · {formatEventDate(event.event_date)}
                      {formatTimeRange(event.start_time, event.end_time)
                        ? ` · ${formatTimeRange(event.start_time, event.end_time)}`
                        : ''}
                      {event.venue_name ? ` · ${event.venue_name}` : ''}
                    </Text>

                    <View style={styles.itemBottom}>
                      <View style={styles.chips}>
                        {optionsForEvent(event, options).map((o) => (
                            <View key={o.code} style={styles.chip}>
                              <View
                                style={[
                                  styles.dot,
                                  { backgroundColor: VoteColors[o.code] ?? Colors.muted },
                                ]}
                              />
                              <Text style={styles.chipText}>
                                {o.label} {summary.counts[o.code] ?? 0}
                              </Text>
                            </View>
                          ))}
                        {summary.noVote > 0 ? (
                          <View style={styles.chip}>
                            <View style={[styles.dot, { backgroundColor: Colors.muted }]} />
                            <Text style={styles.chipText}>미투표 {summary.noVote}</Text>
                          </View>
                        ) : null}
                      </View>

                      <Text
                        style={[
                          styles.status,
                          window === 'open' && { color: Colors.accent },
                          myVote ? { color: VoteColors[myVote] } : null,
                        ]}>
                        {myVote
                          ? `내 응답: ${options.find((o) => o.code === myVote)?.label ?? myVote}`
                          : VOTE_WINDOW_LABEL[window]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.background,
    paddingVertical: 6,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.sm,
  },
  addLabel: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  loader: { marginTop: Spacing.five },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  tab: { flex: 1, paddingVertical: Spacing.two + 2, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.navy },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.textOnNavy, fontWeight: '800' },
  item: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  itemTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text },
  itemDay: { fontSize: 12, fontWeight: '700', color: Colors.navy },
  itemMeta: { fontSize: 13, color: Colors.textSecondary },
  itemBottom: { gap: Spacing.one, marginTop: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12, color: Colors.textSecondary },
  status: { fontSize: 12, fontWeight: '700', color: Colors.muted },
});
