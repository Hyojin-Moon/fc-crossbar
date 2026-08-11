import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { AppButton, Card, FullScreenLoader, Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing, VoteColors } from '@/constants/theme';
import {
  ATTENDANCE_LABEL,
  ATTENDANCE_STATUSES,
  clearAttendance,
  fetchEventAttendance,
  seedAttendanceFromVotes,
  setAttendance,
  summarizeAttendance,
} from '@/lib/attendance';
import { useAuth } from '@/lib/auth-context';
import { confirmAsync } from '@/lib/confirm';
import { formatEventDateLong } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import { fetchEvent, type EventWithVotes } from '@/lib/events';
import { displayName, useActiveMembers } from '@/lib/members';
import { useVoteOptions } from '@/lib/vote-options';
import type { AttendanceStatus, EventAttendance } from '@/types/database';

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  present: Colors.accent,
  late: Colors.warning,
  absent: Colors.muted,
  no_show: Colors.danger,
};

export default function AttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isAdmin } = useAuth();
  const { members, memberIds } = useActiveMembers();
  const voteOptions = useVoteOptions();
  const toast = useToast();

  const [event, setEvent] = useState<EventWithVotes | null>(null);
  const [rows, setRows] = useState<EventAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [ev, attendance] = await Promise.all([fetchEvent(id), fetchEventAttendance(id)]);
      setEvent(ev);
      setRows(attendance);
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <FullScreenLoader />;
  if (!event) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="출석 체크" />
        <View style={styles.content}>
          <Card>
            <SectionTitle>일정을 찾을 수 없습니다</SectionTitle>
            <AppButton label="뒤로" variant="outline" onPress={() => router.back()} />
          </Card>
        </View>
      </View>
    );
  }

  const byMember = new Map(rows.map((r) => [r.member_id, r]));
  const voteByMember = new Map(event.votes.map((v) => [v.member_id, v.vote]));
  const summary = summarizeAttendance(rows, memberIds);

  const setStatus = async (memberId: string, status: AttendanceStatus) => {
    if (!profile || busy) return;
    const current = byMember.get(memberId);
    setBusy(true);
    try {
      if (current?.status === status) {
        await clearAttendance(event.id, memberId);
        toast('기록을 지웠습니다.');
      } else {
        await setAttendance(event.id, memberId, status, profile.id);
        toast(`${ATTENDANCE_LABEL[status]}으로 저장되었습니다.`);
      }
      setRows(await fetchEventAttendance(event.id));
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onSeed = async () => {
    if (busy) return;
    const ok = await confirmAsync({
      title: '투표자 참석 처리',
      message:
        '참석으로 투표한 회원을 모두 참석으로 기록합니다.\n이미 기록된 회원(지각 · 노쇼 등)은 그대로 둡니다.',
      confirmLabel: '기록',
    });
    if (!ok) return;

    setBusy(true);
    try {
      const inserted = await seedAttendanceFromVotes(event.id);
      toast(inserted > 0 ? `${inserted}명을 참석으로 기록했습니다.` : '새로 기록할 회원이 없습니다.');
      setRows(await fetchEventAttendance(event.id));
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="출석 체크"
        subtitle={`${event.title} · ${formatEventDateLong(event.event_date)}`}
        right={
          <Pressable
            accessibilityLabel="뒤로"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={20} color={Colors.textOnNavy} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {!isAdmin ? (
          <Card>
            <SectionTitle>권한이 없습니다</SectionTitle>
            <Muted>출석 기록은 운영진만 할 수 있습니다.</Muted>
          </Card>
        ) : (
          <>
            <Card>
              <SectionTitle>
                출석 {summary.attended}명 / 기록 {summary.recorded}명
              </SectionTitle>
              <Text style={styles.summaryLine}>
                참석 {summary.counts.present} · 지각 {summary.counts.late} · 불참{' '}
                {summary.counts.absent} · 노쇼 {summary.counts.no_show}
                {summary.unrecorded > 0 ? ` · 미기록 ${summary.unrecorded}` : ''}
              </Text>
              <Muted>참석률에는 참석과 지각이 포함됩니다.</Muted>
              <AppButton
                label="투표자를 참석으로 일괄 기록"
                variant="outline"
                disabled={busy}
                onPress={() => void onSeed()}
              />
            </Card>

            <Card>
              <SectionTitle>회원별</SectionTitle>
              <Muted>버튼을 누르면 바로 저장됩니다. 같은 버튼을 다시 누르면 기록이 지워집니다.</Muted>

              {members.map((member) => {
                const record = byMember.get(member.id);
                const vote = voteByMember.get(member.id);
                const voteLabel = vote
                  ? voteOptions.find((o) => o.code === vote)?.label ?? vote
                  : '미투표';
                // 참석 투표했는데 아직 기록이 없으면 노쇼 후보라 눈에 띄게 표시
                const votedAttend = vote
                  ? (voteOptions.find((o) => o.code === vote)?.counts_as_attendance ?? false)
                  : false;

                return (
                  <View key={member.id} style={styles.row}>
                    <View style={styles.rowTop}>
                      <Text style={styles.name} numberOfLines={1}>
                        {displayName(member)}
                      </Text>
                      <Text
                        style={[
                          styles.voteTag,
                          vote ? { color: VoteColors[vote] } : { color: Colors.muted },
                        ]}>
                        투표: {voteLabel}
                      </Text>
                    </View>

                    <View style={styles.statusRow}>
                      {ATTENDANCE_STATUSES.map((status) => {
                        const selected = record?.status === status;
                        const color = STATUS_COLOR[status];
                        return (
                          <Pressable
                            key={status}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            disabled={busy}
                            onPress={() => void setStatus(member.id, status)}
                            style={({ pressed }) => [
                              styles.statusButton,
                              selected
                                ? { backgroundColor: color, borderColor: color }
                                : { borderColor: color },
                              busy && { opacity: 0.5 },
                              pressed && { opacity: 0.7 },
                            ]}>
                            <Text
                              style={[
                                styles.statusText,
                                { color: selected ? '#FFFFFF' : color },
                              ]}>
                              {ATTENDANCE_LABEL[status]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {!record && votedAttend ? (
                      <Text style={styles.hint}>참석 투표 · 아직 기록 없음</Text>
                    ) : null}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  summaryLine: { fontSize: 13, color: Colors.textSecondary },
  row: {
    paddingTop: Spacing.two + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.one,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
  voteTag: { fontSize: 12, fontWeight: '600' },
  statusRow: { flexDirection: 'row', gap: Spacing.one },
  statusButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 11, color: Colors.danger },
});
