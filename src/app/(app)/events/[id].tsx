import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import {
  AppButton,
  Card,
  FullScreenLoader,
  ListRow,
  Muted,
  SectionTitle,
  Screen,
  ScreenScroll,
} from '@/components/ui';
import { VoteCard } from '@/components/vote-card';
import { Colors, Spacing, Typography, VoteColors, Weight } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { confirmAsync } from '@/lib/confirm';
import { formatDeadline, formatEventDateLong, formatTimeRange } from '@/lib/dates';
import {
  deleteEvent,
  fetchEvent,
  getVoteWindow,
  setEventStatus,
  type EventWithVotes,
} from '@/lib/events';
import { describeDbError } from '@/lib/errors';
import { displayName, useActiveMembers } from '@/lib/members';
import { fetchSeasonSquads } from '@/lib/seasons';
import { MATCH_TYPE_LABEL } from '@/lib/venues';
import { optionsForEvent, useVoteOptions } from '@/lib/vote-options';
import { ATTENDANCE_LABEL, COUNTS_AS_ATTENDED } from '@/lib/attendance';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isAdmin } = useAuth();
  const { members, memberIds } = useActiveMembers();
  const options = useVoteOptions();
  const toast = useToast();

  const [event, setEvent] = useState<EventWithVotes | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamName, setTeamName] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const next = await fetchEvent(id);
      setEvent(next);
      // 시즌 경기는 팀 이름을 함께 보여줘야 스코어를 읽을 수 있다
      if (next?.season_id) {
        const squads = await fetchSeasonSquads(next.season_id);
        setTeamName(new Map(squads.map((s) => [s.teamId, s.teamName])));
      } else {
        setTeamName(new Map());
      }
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) return <FullScreenLoader />;
  if (!event) {
    return (
      <Screen>
        <ScreenHeader title="일정" />
        <ScreenScroll>
          <Card>
            <SectionTitle>일정을 찾을 수 없습니다</SectionTitle>
            <Muted>삭제되었거나 접근 권한이 없습니다.</Muted>
            <AppButton label="뒤로" variant="outline" onPress={() => router.back()} />
          </Card>
        </ScreenScroll>
      </Screen>
    );
  }

  const window = getVoteWindow(event);
  const voteByMember = new Map(event.votes.map((v) => [v.member_id, v.vote]));
  // 팀원이 아닌 사람(super_admin 등)의 기록은 제외한다
  const recordedAttendance = (event.attendance ?? []).filter((a) => memberIds.has(a.member_id));
  const attendanceCounts = { present: 0, late: 0, absent: 0, no_show: 0 };
  for (const record of recordedAttendance) attendanceCounts[record.status] += 1;

  const groups = [
    ...optionsForEvent(event, options).map((o) => ({
        key: o.code,
        label: o.label,
        color: VoteColors[o.code] ?? Colors.navy,
        people: members.filter((m) => voteByMember.get(m.id) === o.code),
      })),
    {
      key: 'none',
      label: '미투표',
      color: Colors.muted,
      people: members.filter((m) => !voteByMember.has(m.id)),
    },
  ];

  const confirmClose = async () => {
    const nextStatus = event.status === 'open' ? 'closed' : 'open';
    const verb = nextStatus === 'closed' ? '마감' : '재개';
    const ok = await confirmAsync({
      title: `투표 ${verb}`,
      message: `이 일정의 투표를 ${verb}하시겠습니까?`,
      confirmLabel: verb,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await setEventStatus(event.id, nextStatus);
      toast(`투표를 ${verb}했습니다.`);
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const ok = await confirmAsync({
      title: '일정 삭제',
      message: `'${event.title}'을(를) 삭제합니다. 투표 기록도 함께 삭제됩니다.`,
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await deleteEvent(event.id);
      toast('삭제했습니다.');
      router.back();
    } catch (e) {
      toast(describeDbError(e), 'error');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={event.title}
        subtitle={`${MATCH_TYPE_LABEL[event.match_type]} · ${formatEventDateLong(event.event_date)}`}
        onBack={() => router.back()}
      />

      <ScreenScroll>
        {profile ? (
          <VoteCard
            event={event}
            memberId={profile.id}
            memberIds={memberIds}
            onChanged={load}
          />
        ) : null}

        {event.match_type === 'season' && event.home_team_id ? (
          <Card>
            <SectionTitle>시즌 경기</SectionTitle>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreTeam} numberOfLines={1}>
                {teamName.get(event.home_team_id) ?? '홈'}
              </Text>
              <Text style={styles.scoreValue}>
                {event.home_score === null
                  ? '결과 입력 전'
                  : `${event.home_score} : ${event.away_score}`}
              </Text>
              <Text style={[styles.scoreTeam, styles.scoreTeamRight]} numberOfLines={1}>
                {teamName.get(event.away_team_id ?? '') ?? '원정'}
              </Text>
            </View>
          </Card>
        ) : null}

        {event.venue_address || event.map_url || event.description ? (
          <Card>
            <SectionTitle>상세 정보</SectionTitle>
            {event.venue_name ? <InfoRow label="구장" value={event.venue_name} /> : null}
            {event.venue_address ? <InfoRow label="주소" value={event.venue_address} /> : null}
            {formatTimeRange(event.start_time, event.end_time) ? (
              <InfoRow label="시간" value={formatTimeRange(event.start_time, event.end_time)} />
            ) : null}
            {event.description ? <InfoRow label="안내" value={event.description} /> : null}
            {event.map_url ? (
              <AppButton
                label="지도로 보기"
                variant="outline"
                onPress={() => void Linking.openURL(event.map_url!)}
              />
            ) : null}
          </Card>
        ) : null}

        <Card>
          <SectionTitle>참석 현황</SectionTitle>
          <Muted>항목을 누르면 명단이 보입니다.</Muted>
          {groups.map((group, index) => {
            const open = expanded === group.key;
            return (
              <ListRow
                key={group.key}
                first={index === 0}
                dotColor={group.color}
                title={group.label}
                trailing={`${group.people.length}명`}
                expanded={open}
                onPress={() => setExpanded(open ? null : group.key)}>
                {group.people.length === 0 ? (
                  <Muted>없음</Muted>
                ) : (
                  <View style={styles.nameList}>
                    {group.people.map((m) => (
                      <Text key={m.id} style={styles.name}>
                        {displayName(m)}
                      </Text>
                    ))}
                  </View>
                )}
              </ListRow>
            );
          })}
        </Card>

        {recordedAttendance.length > 0 ? (
          <Card>
            <SectionTitle>출석 결과</SectionTitle>
            <Muted>운영진이 경기 후 기록한 실제 출석입니다. 참석률에 쓰입니다.</Muted>
            <Text style={styles.attendanceLine}>
              {(['present', 'late', 'absent', 'no_show'] as const)
                .map((st) => `${ATTENDANCE_LABEL[st]} ${attendanceCounts[st]}`)
                .join(' · ')}
            </Text>
            <Text style={styles.attendanceTotal}>
              출석 인원 {recordedAttendance.filter((a) => COUNTS_AS_ATTENDED.includes(a.status)).length}명
            </Text>
          </Card>
        ) : null}

        {isAdmin ? (
          <Card>
            <SectionTitle>관리</SectionTitle>
            <Muted>
              투표 상태: {event.status === 'open' ? '열림' : event.status === 'closed' ? '마감' : '취소'}
              {event.vote_deadline ? ` · 마감 예정 ${formatDeadline(event.vote_deadline)}` : ''}
            </Muted>
            <AppButton
              label="출석 체크"
              disabled={busy}
              onPress={() => router.push(`/(app)/events/attendance?id=${event.id}`)}
            />
            <AppButton
              label="경기 기록 (스코어 · 스탯)"
              variant="outline"
              disabled={busy}
              onPress={() => router.push(`/(app)/events/result?id=${event.id}`)}
            />
            <AppButton
              label="일정 수정"
              variant="outline"
              disabled={busy}
              onPress={() => router.push(`/(app)/events/form?id=${event.id}`)}
            />
            <AppButton
              label={event.status === 'open' ? '투표 마감' : '투표 재개'}
              variant="outline"
              color={event.status === 'open' ? Colors.warning : Colors.accent}
              disabled={busy}
              onPress={() => void confirmClose()}
            />
            <AppButton
              label="일정 삭제"
              variant="outline"
              color={Colors.danger}
              disabled={busy}
              onPress={() => void confirmDelete()}
            />
            {window === 'before' ? (
              <Muted>투표 시작 시각이 아직 오지 않아 회원은 투표할 수 없습니다.</Muted>
            ) : null}
          </Card>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoRow: { flexDirection: 'row', gap: Spacing.two },
  infoLabel: { width: 48, ...Typography.body, color: Colors.textSecondary },
  infoValue: { flex: 1, ...Typography.body, color: Colors.text },
  nameList: { paddingBottom: Spacing.two, paddingLeft: Spacing.four, gap: Spacing.half },
  name: { ...Typography.body, color: Colors.textSecondary },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  scoreTeam: { flex: 1, minWidth: 0, ...Typography.body, fontWeight: Weight.bold, color: Colors.text },
  scoreTeamRight: { textAlign: 'right' },
  scoreValue: { ...Typography.title, fontWeight: Weight.bold, color: Colors.navy },
  attendanceLine: { ...Typography.body, color: Colors.text },
  attendanceTotal: { ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.navy },
});
