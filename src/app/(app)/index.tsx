import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { VoteCard } from '@/components/vote-card';
import { Colors, Spacing } from '@/constants/theme';
import { formatEventDate, formatTimeRange, relativeDayLabel } from '@/lib/dates';
import { useAuth } from '@/lib/auth-context';
import {
  fetchPastEvents,
  fetchUpcomingEvents,
  getVoteWindow,
  summarizeVotes,
  type EventWithVotes,
} from '@/lib/events';
import { useActiveMembers } from '@/lib/members';
import { useSettings } from '@/lib/settings';
import { useVoteOptions } from '@/lib/vote-options';

export default function HomeScreen() {
  const { profile } = useAuth();
  const { members } = useActiveMembers();
  const settings = useSettings();
  const voteOptions = useVoteOptions();

  const [upcoming, setUpcoming] = useState<EventWithVotes[]>([]);
  const [past, setPast] = useState<EventWithVotes[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [next, recent] = await Promise.all([fetchUpcomingEvents(), fetchPastEvents(3)]);
      setUpcoming(next);
      setPast(recent);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 상세 화면에서 투표하고 돌아왔을 때 인원수가 갱신되도록 포커스마다 다시 읽는다.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // 투표할 수 있는(또는 곧 열리는) 일정을 가장 위에 크게 보여준다.
  const votable = upcoming.filter((e) => getVoteWindow(e) !== 'closed');
  const others = upcoming.filter((e) => getVoteWindow(e) === 'closed');

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={settings.teamName}
        subtitle={`${profile?.nickname || profile?.name}님, 반갑습니다`}
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
                  memberCount={members.length}
                  onChanged={load}
                  onPressDetail={() => router.push(`/(app)/events/${event.id}`)}
                />
              ))
            ) : (
              <Card>
                <SectionTitle>예정된 투표가 없습니다</SectionTitle>
                <Muted>새 일정이 등록되면 여기에 표시됩니다.</Muted>
              </Card>
            )}

            {others.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle>예정 일정</SectionTitle>
                {others.map((event) => (
                  <EventRow key={event.id} event={event} memberCount={members.length} options={voteOptions} />
                ))}
              </View>
            ) : null}

            {past.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle>최근 경기</SectionTitle>
                {past.map((event) => (
                  <EventRow key={event.id} event={event} memberCount={members.length} options={voteOptions} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function EventRow({
  event,
  memberCount,
  options,
}: {
  event: EventWithVotes;
  memberCount: number;
  options: Parameters<typeof summarizeVotes>[1];
}) {
  const summary = summarizeVotes(event.votes, options, memberCount);

  return (
    <Pressable
      onPress={() => router.push(`/(app)/events/${event.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.rowMeta}>
          {formatEventDate(event.event_date)}
          {formatTimeRange(event.start_time, event.end_time)
            ? ` · ${formatTimeRange(event.start_time, event.end_time)}`
            : ''}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowCount}>참석 {summary.attendCount}</Text>
        <Text style={styles.rowDay}>{relativeDayLabel(event.event_date)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  loader: { marginTop: Spacing.five },
  section: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  rowPressed: { opacity: 0.7 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  rowMeta: { fontSize: 13, color: Colors.textSecondary },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowCount: { fontSize: 13, fontWeight: '700', color: Colors.accent },
  rowDay: { fontSize: 12, color: Colors.muted },
});
