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
import { Colors, Radius, Spacing, VoteColors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { describeDbError } from '@/lib/errors';
import { formatEventDate, formatTimeRange, relativeDayLabel } from '@/lib/dates';
import {
  fetchPastEvents,
  fetchUpcomingEvents,
  getVoteWindow,
  summarizeVotes,
  VOTE_WINDOW_LABEL,
  type EventWithVotes,
} from '@/lib/events';
import { useActiveMembers } from '@/lib/members';
import { MATCH_TYPE_LABEL } from '@/lib/venues';
import { useVoteOptions } from '@/lib/vote-options';

type Tab = 'upcoming' | 'past';

export default function EventListScreen() {
  const { profile, isAdmin } = useAuth();
  const { members } = useActiveMembers();
  const options = useVoteOptions();

  const [tab, setTab] = useState<Tab>('upcoming');
  const [events, setEvents] = useState<EventWithVotes[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents(tab === 'upcoming' ? await fetchUpcomingEvents() : await fetchPastEvents(50));
      setError(null);
    } catch (e) {
      setError(describeDbError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="일정 / 투표"
        right={
          isAdmin ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="새 일정 만들기"
              onPress={() => router.push('/(app)/events/form')}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <Ionicons name="add" size={22} color={Colors.navy} />
              <Text style={styles.addLabel}>새 일정</Text>
            </Pressable>
          ) : undefined
        }
      />

      <View style={styles.tabs}>
        {(['upcoming', 'past'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              setTab(t);
              setLoading(true);
            }}
            style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'upcoming' ? '예정' : '지난 경기'}
            </Text>
          </Pressable>
        ))}
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
        ) : events.length === 0 ? (
          <Card>
            <SectionTitle>{tab === 'upcoming' ? '예정된 일정이 없습니다' : '지난 경기가 없습니다'}</SectionTitle>
            {isAdmin && tab === 'upcoming' ? (
              <Muted>우측 상단 &lsquo;새 일정&rsquo;으로 만들 수 있습니다.</Muted>
            ) : null}
          </Card>
        ) : (
          events.map((event) => {
            const summary = summarizeVotes(event.votes, options, members.length);
            const window = getVoteWindow(event);
            const myVote = profile
              ? event.votes.find((v) => v.member_id === profile.id)?.vote ?? null
              : null;

            return (
              <Pressable
                key={event.id}
                onPress={() => router.push(`/(app)/events/${event.id}`)}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
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
                    {options
                      .filter((o) => event.allowed_votes.includes(o.code))
                      .map((o) => (
                        <View key={o.code} style={styles.chip}>
                          <View
                            style={[styles.dot, { backgroundColor: VoteColors[o.code] ?? Colors.muted }]}
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
  pressed: { opacity: 0.7 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: Spacing.three, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.navy },
  tabText: { fontSize: 15, fontWeight: '600', color: Colors.muted },
  tabTextActive: { color: Colors.navy, fontWeight: '800' },
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  loader: { marginTop: Spacing.five },
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
