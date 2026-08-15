import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { useToast } from '@/components/toast';
import { Colors, Radius, Spacing, Typography, VoteColors, Weight } from '@/constants/theme';
import {
  formatDeadline,
  formatEventDateLong,
  formatTimeRange,
  relativeDayLabel,
  timeLeftLabel,
} from '@/lib/dates';
import {
  getVoteWindow,
  saveVote,
  summarizeVotes,
  VOTE_WINDOW_LABEL,
  type EventWithVotes,
} from '@/lib/events';
import { describeDbError } from '@/lib/errors';
import { optionsForEvent, useVoteOptions } from '@/lib/vote-options';
import type { VoteCode } from '@/types/database';

type Props = {
  event: EventWithVotes;
  memberId: string;
  memberIds: Set<string>;
  onChanged: () => void;
  onPressDetail?: () => void;
};

export function VoteCard({ event, memberId, memberIds, onChanged, onPressDetail }: Props) {
  const toast = useToast();
  const allOptions = useVoteOptions();
  const options = optionsForEvent(event, allOptions);
  const summary = summarizeVotes(event.votes, allOptions, memberIds);
  const window = getVoteWindow(event);

  const serverVote = event.votes.find((v) => v.member_id === memberId)?.vote ?? null;
  // 저장 요청이 오가는 동안 버튼이 먼저 반응하도록 낙관적으로 덮어쓴다.
  const [optimistic, setOptimistic] = useState<VoteCode | null | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const myVote = optimistic !== undefined ? optimistic : serverVote;

  // 부모가 새로 불러오면 낙관적 값은 버린다.
  useEffect(() => setOptimistic(undefined), [serverVote]);

  const submit = async (code: VoteCode, label: string) => {
    if (window !== 'open' || pending) return;
    const previous = myVote;
    setOptimistic(code);
    setPending(true);
    try {
      await saveVote(event.id, memberId, code);
      toast(`${label}으로 저장되었습니다.`);
      onChanged();
    } catch (e) {
      setOptimistic(previous);
      toast(describeDbError(e), 'error');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.badge, styles[`badge_${window}`]]}>
          <Text style={styles.badgeText}>{VOTE_WINDOW_LABEL[window]}</Text>
        </View>
        <Text style={styles.dayLabel}>{relativeDayLabel(event.event_date)}</Text>
      </View>

      <Pressable onPress={onPressDetail} disabled={!onPressDetail}>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.when}>{formatEventDateLong(event.event_date)}</Text>
        {formatTimeRange(event.start_time, event.end_time) ? (
          <Text style={styles.when}>{formatTimeRange(event.start_time, event.end_time)}</Text>
        ) : null}
        {event.venue_name ? <Text style={styles.venue}>{event.venue_name}</Text> : null}
      </Pressable>

      <View style={styles.divider} />

      <View style={styles.countRow}>
        <Text style={styles.countLabel}>현재 참석</Text>
        <Text style={styles.countValue}>
          {summary.attendCount}명
          {event.max_attendees ? <Text style={styles.countMax}> / {event.max_attendees}</Text> : null}
          {summary.guestCount > 0 ? (
            <Text style={styles.countMax}> (게스트 {summary.guestCount})</Text>
          ) : null}
        </Text>
      </View>

      <View style={styles.buttonRow}>
        {options.map((option) => {
          const selected = myVote === option.code;
          const color = VoteColors[option.code] ?? Colors.navy;
          return (
            <Pressable
              key={option.code}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: window !== 'open' }}
              onPress={() => void submit(option.code, option.label)}
              disabled={window !== 'open' || pending}
              style={({ pressed }) => [
                styles.voteButton,
                selected ? { backgroundColor: color, borderColor: color } : { borderColor: color },
                window !== 'open' && styles.voteButtonDisabled,
                pressed && styles.voteButtonPressed,
              ]}>
              <Text style={[styles.voteLabel, { color: selected ? '#FFFFFF' : color }]}>
                {option.label}
              </Text>
              <Text style={[styles.voteCount, { color: selected ? '#FFFFFF' : Colors.textSecondary }]}>
                {summary.counts[option.code] ?? 0}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        {window === 'before' ? (
          <Text style={styles.footerText}>
            투표 시작 {formatDeadline(event.vote_open_at)}
          </Text>
        ) : window === 'open' ? (
          <Text style={styles.footerText}>
            {event.vote_deadline
              ? `마감 ${formatDeadline(event.vote_deadline)} · ${timeLeftLabel(event.vote_deadline)}`
              : '마감 시간 없음'}
          </Text>
        ) : (
          <Text style={styles.footerText}>
            투표가 마감되었습니다{myVote ? ` · 내 응답 ${optionLabel(myVote, options)}` : ''}
          </Text>
        )}
        {summary.noVote > 0 && window !== 'closed' ? (
          <Text style={styles.footerMuted}>미투표 {summary.noVote}명</Text>
        ) : null}
      </View>
    </Card>
  );
}

function optionLabel(code: VoteCode, options: { code: string; label: string }[]): string {
  return options.find((o) => o.code === code)?.label ?? code;
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, borderRadius: Radius.sm },
  badge_before: { backgroundColor: Colors.muted },
  badge_open: { backgroundColor: Colors.accent },
  badge_closed: { backgroundColor: Colors.navySoft },
  badgeText: { color: '#FFFFFF', ...Typography.caption, fontWeight: Weight.bold },
  dayLabel: { ...Typography.body, fontWeight: Weight.bold, color: Colors.navy },
  title: { ...Typography.title, fontWeight: Weight.bold, color: Colors.text, marginTop: Spacing.one },
  when: { ...Typography.body, color: Colors.textSecondary },
  venue: { ...Typography.body, color: Colors.textSecondary, marginTop: Spacing.half },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.one },
  countRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  countLabel: { ...Typography.body, color: Colors.textSecondary },
  countValue: { ...Typography.title, fontWeight: Weight.bold, color: Colors.navy },
  countMax: { ...Typography.body, fontWeight: Weight.semibold, color: Colors.textSecondary },
  buttonRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  voteButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteButtonDisabled: { opacity: 0.4 },
  voteButtonPressed: { opacity: 0.7 },
  voteLabel: { ...Typography.bodyLarge, fontWeight: Weight.bold },
  voteCount: { ...Typography.caption, fontWeight: Weight.semibold, marginTop: Spacing.half },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  footerText: { ...Typography.caption, color: Colors.textSecondary },
  footerMuted: { ...Typography.caption, color: Colors.muted },
});
