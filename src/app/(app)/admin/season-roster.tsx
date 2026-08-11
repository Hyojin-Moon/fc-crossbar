import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateTimeInput } from '@/components/datetime-input';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { AppButton, Card, Field, FullScreenLoader, Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { confirmAsync } from '@/lib/confirm';
import { formatEventDate } from '@/lib/dates';
import { describeDbError } from '@/lib/errors';
import { useActiveMembers } from '@/lib/members';
import {
  addSeasonTeam,
  applyBaseRoster,
  assignToSquad,
  copySeasonRoster,
  fetchSeason,
  fetchSeasons,
  fetchSeasonSquads,
  removeSeasonTeam,
  SEASON_STATUS_LABEL,
  SEASON_STATUSES,
  unassignFromSeason,
  updateSeason,
  type SeasonSquad,
} from '@/lib/seasons';
import { useTeams } from '@/lib/teams';
import type { Season, SeasonStatus } from '@/types/database';

export default function SeasonRosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { members } = useActiveMembers();
  const { teams } = useTeams();

  const [season, setSeason] = useState<Season | null>(null);
  const [squads, setSquads] = useState<SeasonSquad[]>([]);
  const [others, setOthers] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [info, setInfo] = useState({
    name: '',
    start: '',
    end: '',
    status: 'upcoming' as SeasonStatus,
    memo: '',
  });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [s, sq, all] = await Promise.all([fetchSeason(id), fetchSeasonSquads(id), fetchSeasons()]);
      setSeason(s);
      setSquads(sq);
      setOthers(all.filter((x) => x.id !== id));
      if (s) {
        setInfo({
          name: s.name,
          start: s.start_date,
          end: s.end_date,
          status: s.status,
          memo: s.memo ?? '',
        });
      }
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
  if (!season) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="시즌" />
        <View style={styles.content}>
          <Card>
            <SectionTitle>시즌을 찾을 수 없습니다</SectionTitle>
            <AppButton label="뒤로" variant="outline" onPress={() => router.back()} />
          </Card>
        </View>
      </View>
    );
  }

  const run = async (label: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action();
      toast(typeof result === 'number' ? `${label} · ${result}명` : `${label} 완료`);
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveInfo = async () => {
    if (busy) return;
    if (!info.name.trim()) {
      toast('시즌 이름을 입력해 주세요.', 'error');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(info.start) || !/^\d{4}-\d{2}-\d{2}$/.test(info.end)) {
      toast('기간을 YYYY-MM-DD 형식으로 입력해 주세요.', 'error');
      return;
    }
    if (info.end < info.start) {
      toast('종료일이 시작일보다 빠릅니다.', 'error');
      return;
    }
    await run('저장', () =>
      updateSeason(season.id, {
        name: info.name.trim(),
        start_date: info.start,
        end_date: info.end,
        status: info.status,
        memo: info.memo.trim() || null,
      })
    );
  };

  const changed =
    info.name !== season.name ||
    info.start !== season.start_date ||
    info.end !== season.end_date ||
    info.status !== season.status ||
    info.memo !== (season.memo ?? '');

  // 이 시즌에 이미 배정된 회원 -> 어느 팀인지
  const teamOfMember = new Map<string, string>();
  for (const squad of squads) {
    for (const m of squad.members) teamOfMember.set(m.id, squad.teamName);
  }
  const assignedCount = teamOfMember.size;
  const joinedTeamIds = new Set(squads.map((s) => s.teamId));
  const availableTeams = teams.filter((t) => t.is_active && !joinedTeamIds.has(t.id));

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={season.name}
        subtitle={`${formatEventDate(season.start_date)} ~ ${formatEventDate(season.end_date)} · ${
          SEASON_STATUS_LABEL[season.status]
        }`}
        right={
          <Pressable
            accessibilityLabel="뒤로"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={20} color={Colors.textOnNavy} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionTitle>시즌 정보</SectionTitle>

          <View style={styles.field}>
            <Text style={styles.label}>상태</Text>
            <View style={styles.chips}>
              {SEASON_STATUSES.map((st) => (
                <Pressable
                  key={st}
                  disabled={busy}
                  onPress={() => setInfo((prev) => ({ ...prev, status: st }))}
                  style={[styles.statusChip, info.status === st && styles.statusChipOn]}>
                  <Text
                    style={[styles.statusText, info.status === st && styles.statusTextOn]}>
                    {SEASON_STATUS_LABEL[st]}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/* 통계 탭과 시즌 탭이 '진행 중' 시즌을 기본으로 골라 보여준다 */}
            <Muted>‘진행 중’ 으로 두면 시즌 · 통계 탭에서 이 시즌이 기본으로 열립니다.</Muted>
          </View>

          <Field
            label="이름"
            value={info.name}
            onChangeText={(v) => setInfo((prev) => ({ ...prev, name: v }))}
            placeholder="예) 2026 상반기 리그"
          />
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <DateTimeInput
                label="시작일"
                mode="date"
                value={info.start}
                onChange={(v) => setInfo((prev) => ({ ...prev, start: v }))}
              />
            </View>
            <View style={styles.pairItem}>
              <DateTimeInput
                label="종료일"
                mode="date"
                value={info.end}
                onChange={(v) => setInfo((prev) => ({ ...prev, end: v }))}
              />
            </View>
          </View>
          <Field
            label="메모"
            value={info.memo}
            onChangeText={(v) => setInfo((prev) => ({ ...prev, memo: v }))}
            placeholder="선택"
          />
          <AppButton
            label={changed ? '변경 사항 저장' : '저장됨'}
            disabled={busy || !changed}
            onPress={() => void saveInfo()}
          />
        </Card>

        <Card>
          <SectionTitle>참가 팀 {squads.length}팀 · 배정 {assignedCount}명</SectionTitle>
          {squads.length < 2 ? (
            <Muted>시즌 경기를 만들려면 참가 팀이 2팀 이상이어야 합니다.</Muted>
          ) : null}

          {availableTeams.length > 0 ? (
            <>
              <Muted>팀을 눌러 이 시즌에 참가시킵니다.</Muted>
              <View style={styles.chips}>
                {availableTeams.map((team) => (
                  <Pressable
                    key={team.id}
                    disabled={busy}
                    onPress={() => void run('참가', () => addSeasonTeam(season.id, team.id))}
                    style={({ pressed }) => [styles.addChip, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="add" size={14} color={Colors.navy} />
                    <Text style={styles.addChipText}>{team.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : teams.length === 0 ? (
            <Muted>등록된 팀이 없습니다. 관리 &gt; 팀 관리에서 먼저 만들어 주세요.</Muted>
          ) : (
            <Muted>활성 팀이 모두 참가 중입니다.</Muted>
          )}
        </Card>

        {squads.length > 0 ? (
          <Card>
            <SectionTitle>명단 한 번에 채우기</SectionTitle>
            <Muted>
              이미 이 시즌에 배정된 회원은 건드리지 않습니다. 한 시즌에 한 사람은 한 팀입니다.
            </Muted>
            <AppButton
              label="팀 기본 명단 불러오기"
              variant="outline"
              disabled={busy}
              onPress={() => void run('불러왔습니다', () => applyBaseRoster(season.id))}
            />
            {others.length > 0 ? (
              <>
                <Text style={styles.label}>지난 시즌에서 복사</Text>
                <View style={styles.chips}>
                  {others.map((other) => (
                    <Pressable
                      key={other.id}
                      disabled={busy}
                      onPress={() =>
                        void run('복사했습니다', () => copySeasonRoster(other.id, season.id))
                      }
                      style={({ pressed }) => [styles.addChip, pressed && { opacity: 0.7 }]}>
                      <Ionicons name="copy-outline" size={14} color={Colors.navy} />
                      <Text style={styles.addChipText}>{other.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Muted>양쪽 시즌에 같은 팀이 참가하고 있을 때만 옮겨집니다.</Muted>
              </>
            ) : null}
          </Card>
        ) : null}

        {squads.map((squad) => {
          const open = openTeam === squad.seasonTeamId;
          return (
            <Card key={squad.seasonTeamId}>
              <View style={styles.teamHead}>
                <View
                  style={[styles.teamDot, { backgroundColor: squad.color ?? Colors.navySoft }]}
                />
                <Text style={styles.teamName}>{squad.teamName}</Text>
                <Text style={styles.teamCount}>{squad.members.length}명</Text>
                <Pressable
                  disabled={busy}
                  onPress={async () => {
                    const ok = await confirmAsync({
                      title: '참가 취소',
                      message: `${squad.teamName}을(를) 이 시즌에서 뺍니다.\n이 시즌 명단 ${squad.members.length}명도 함께 지워집니다.`,
                      confirmLabel: '빼기',
                      destructive: true,
                    });
                    if (ok) await run('참가 취소', () => removeSeasonTeam(squad.seasonTeamId));
                  }}
                  style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}>
                  <Text style={styles.removeText}>참가 취소</Text>
                </Pressable>
              </View>

              {squad.members.length > 0 ? (
                <View style={styles.memberList}>
                  {squad.members.map((m) => (
                    <Pressable
                      key={m.id}
                      disabled={busy}
                      onPress={() =>
                        void run('제외', () => unassignFromSeason(season.id, m.id))
                      }
                      style={({ pressed }) => [styles.memberChip, pressed && { opacity: 0.6 }]}>
                      <Text style={styles.memberChipText}>{m.name}</Text>
                      <Ionicons name="close" size={13} color={Colors.textSecondary} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Muted>아직 배정된 회원이 없습니다.</Muted>
              )}

              <Pressable
                onPress={() => setOpenTeam(open ? null : squad.seasonTeamId)}
                style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.7 }]}>
                <Text style={styles.toggleText}>{open ? '닫기' : '회원 배정'}</Text>
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={Colors.navy}
                />
              </Pressable>

              {open ? (
                <View style={styles.picker}>
                  {members.map((member) => {
                    const inTeam = teamOfMember.get(member.id);
                    const here = inTeam === squad.teamName;
                    return (
                      <Pressable
                        key={member.id}
                        disabled={busy || (Boolean(inTeam) && !here)}
                        onPress={() =>
                          void run(
                            here ? '제외' : '배정',
                            here
                              ? () => unassignFromSeason(season.id, member.id)
                              : () => assignToSquad(season.id, squad.seasonTeamId, member.id)
                          )
                        }
                        style={({ pressed }) => [
                          styles.pickRow,
                          here && styles.pickRowOn,
                          Boolean(inTeam) && !here && styles.pickRowOff,
                          pressed && { opacity: 0.7 },
                        ]}>
                        <Ionicons
                          name={here ? 'checkbox' : 'square-outline'}
                          size={18}
                          color={here ? Colors.accent : Colors.muted}
                        />
                        <Text style={[styles.pickName, here && styles.pickNameOn]}>
                          {member.name}
                        </Text>
                        {inTeam && !here ? (
                          <Text style={styles.pickNote}>{inTeam}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </Card>
          );
        })}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.navy,
    backgroundColor: Colors.background,
  },
  addChipText: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.one },
  field: { gap: Spacing.one },
  pair: { flexDirection: 'row', gap: Spacing.two },
  pairItem: { flex: 1, minWidth: 0 },
  statusChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  statusChipOn: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  statusText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  statusTextOn: { color: Colors.textOnNavy },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  teamDot: { width: 12, height: 12, borderRadius: 6 },
  teamName: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text },
  teamCount: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  removeBtn: { paddingHorizontal: Spacing.one },
  removeText: { fontSize: 12, fontWeight: '700', color: Colors.danger },
  memberList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
  },
  memberChipText: { fontSize: 13, color: Colors.text },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  toggleText: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  picker: { gap: 2 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.sm,
  },
  pickRowOn: { backgroundColor: '#EAF7F1' },
  pickRowOff: { opacity: 0.45 },
  pickName: { flex: 1, fontSize: 15, color: Colors.text },
  pickNameOn: { fontWeight: '700' },
  pickNote: { fontSize: 12, color: Colors.muted },
});
