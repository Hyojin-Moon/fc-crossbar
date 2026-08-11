import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { AppButton, Card, Field, Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { confirmAsync } from '@/lib/confirm';
import { describeDbError } from '@/lib/errors';
import { displayName, useActiveMembers } from '@/lib/members';
import {
  addToBaseRoster,
  createTeam,
  deleteTeam,
  fetchBaseRoster,
  fetchTeams,
  removeFromBaseRoster,
  TEAM_COLORS,
  updateTeam,
  type BaseRosterRow,
} from '@/lib/teams';
import type { TeamWithRoster } from '@/types/database';

const EMPTY = { name: '', color: TEAM_COLORS[0] as string, memo: '' };

export default function TeamsScreen() {
  const toast = useToast();
  const { members } = useActiveMembers();

  const [teams, setTeams] = useState<TeamWithRoster[]>([]);
  const [roster, setRoster] = useState<BaseRosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openRoster, setOpenRoster] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([fetchTeams(), fetchBaseRoster()]);
      setTeams(t);
      setRoster(r);
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
  };

  const onSubmit = async () => {
    if (!form.name.trim()) {
      toast('팀 이름을 입력해 주세요.', 'error');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        color: form.color || null,
        memo: form.memo.trim() || null,
        is_active: true,
      };
      if (editingId) {
        await updateTeam(editingId, payload);
        toast('수정했습니다.');
      } else {
        await createTeam(payload);
        toast('팀을 만들었습니다.');
      }
      reset();
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onToggleActive = async (team: TeamWithRoster) => {
    setBusy(true);
    try {
      await updateTeam(team.id, { is_active: !team.is_active });
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (team: TeamWithRoster) => {
    const ok = await confirmAsync({
      title: '팀 삭제',
      message: `${team.name}을(를) 삭제합니다.\n기본 명단도 함께 삭제됩니다. 이 팀이 참가한 시즌 기록이 있으면 그쪽도 영향을 받습니다.`,
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await deleteTeam(team.id);
      toast('삭제했습니다.');
      if (editingId === team.id) reset();
      if (openRoster === team.id) setOpenRoster(null);
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleMember = async (teamId: string, memberId: string, assigned: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (assigned) await removeFromBaseRoster(teamId, memberId);
      else await addToBaseRoster(teamId, memberId);
      const [t, r] = await Promise.all([fetchTeams(), fetchBaseRoster()]);
      setTeams(t);
      setRoster(r);
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const teamNameOf = new Map(teams.map((t) => [t.id, t.name]));
  const teamsOfMember = (memberId: string) =>
    roster.filter((r) => r.member_id === memberId).map((r) => teamNameOf.get(r.team_id) ?? '?');

  const assignedCount = new Set(roster.map((r) => r.member_id)).size;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="팀 관리"
        subtitle={`${teams.filter((t) => t.is_active).length}팀 사용 중`}
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
          <SectionTitle>{editingId ? '팀 수정' : '팀 만들기'}</SectionTitle>
          <Muted>
            팀은 시즌과 무관하게 존재합니다. 시즌을 만들지 않아도 팀을 구성해 둘 수 있고,
            시즌을 열 때 이 기본 명단을 불러와 조정합니다.
          </Muted>
          <Field
            label="팀 이름"
            value={form.name}
            onChangeText={(v) => setForm((prev) => ({ ...prev, name: v }))}
            placeholder="예) A팀"
          />

          <View style={styles.field}>
            <Text style={styles.label}>팀 색</Text>
            <View style={styles.colorRow}>
              {TEAM_COLORS.map((c) => (
                <Pressable
                  key={c}
                  accessibilityLabel={`색 ${c}`}
                  onPress={() => setForm((prev) => ({ ...prev, color: c }))}
                  style={[
                    styles.colorChip,
                    { backgroundColor: c },
                    form.color === c && styles.colorChipSelected,
                  ]}>
                  {form.color === c ? (
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  ) : null}
                </Pressable>
              ))}
            </View>
            <Muted>조끼 색처럼 화면에서 팀을 구분하는 데 씁니다.</Muted>
          </View>

          <Field
            label="메모"
            value={form.memo}
            onChangeText={(v) => setForm((prev) => ({ ...prev, memo: v }))}
            placeholder="선택 · 예) 조끼 초록, 주로 수요일"
          />
          <AppButton
            label={editingId ? '수정 저장' : '팀 만들기'}
            onPress={() => void onSubmit()}
            loading={busy}
          />
          {editingId ? <AppButton label="취소" variant="ghost" onPress={reset} /> : null}
        </Card>

        <Card>
          <SectionTitle>팀 목록</SectionTitle>
          <Muted>
            전체 {members.length}명 중 {assignedCount}명이 어느 팀엔가 배정되어 있습니다.
          </Muted>

          {loading ? (
            <ActivityIndicator color={Colors.navy} style={styles.loader} />
          ) : teams.length === 0 ? (
            <Muted>아직 만든 팀이 없습니다.</Muted>
          ) : (
            teams.map((team) => {
              const open = openRoster === team.id;
              return (
                <View key={team.id} style={styles.row}>
                  <View style={styles.rowTop}>
                    <View
                      style={[styles.teamDot, { backgroundColor: team.color ?? Colors.muted }]}
                    />
                    <View style={styles.rowText}>
                      <Text style={[styles.name, !team.is_active && styles.nameInactive]}>
                        {team.name}
                      </Text>
                      <Text style={styles.meta}>
                        기본 명단 {team.member_count}명
                        {team.memo ? ` · ${team.memo}` : ''}
                      </Text>
                    </View>
                    <Switch
                      value={team.is_active}
                      disabled={busy}
                      onValueChange={() => void onToggleActive(team)}
                      trackColor={{ true: Colors.accent, false: Colors.border }}
                    />
                  </View>

                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => setOpenRoster(open ? null : team.id)}
                      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
                      <Text style={styles.actionText}>{open ? '명단 닫기' : '명단 지정'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditingId(team.id);
                        setForm({
                          name: team.name,
                          color: team.color ?? TEAM_COLORS[0],
                          memo: team.memo ?? '',
                        });
                      }}
                      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
                      <Text style={styles.actionText}>수정</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void onDelete(team)}
                      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
                      <Text style={[styles.actionText, { color: Colors.danger }]}>삭제</Text>
                    </Pressable>
                  </View>

                  {open ? (
                    <View style={styles.rosterBox}>
                      <Muted>이름을 누르면 바로 저장됩니다.</Muted>
                      {members.length === 0 ? (
                        <Muted>활성 회원이 없습니다.</Muted>
                      ) : (
                        members.map((member) => {
                          const assigned = roster.some(
                            (r) => r.team_id === team.id && r.member_id === member.id
                          );
                          const others = teamsOfMember(member.id).filter((n) => n !== team.name);
                          return (
                            <Pressable
                              key={member.id}
                              disabled={busy}
                              onPress={() => void toggleMember(team.id, member.id, assigned)}
                              style={({ pressed }) => [
                                styles.memberRow,
                                assigned && styles.memberRowOn,
                                busy && { opacity: 0.5 },
                                pressed && { opacity: 0.7 },
                              ]}>
                              <Ionicons
                                name={assigned ? 'checkbox' : 'square-outline'}
                                size={20}
                                color={assigned ? Colors.accent : Colors.muted}
                              />
                              <Text
                                style={[styles.memberName, assigned && styles.memberNameOn]}
                                numberOfLines={1}>
                                {displayName(member)}
                              </Text>
                              {others.length > 0 ? (
                                <Text style={styles.otherTeams}>{others.join(' · ')} 에도 있음</Text>
                              ) : null}
                            </Pressable>
                          );
                        })
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
          <Muted>스위치를 끄면 새 일정·시즌에서 고를 수 없게 됩니다. 기록은 남습니다.</Muted>
        </Card>
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
  loader: { marginVertical: Spacing.four },
  field: { gap: Spacing.one },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  colorChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorChipSelected: { borderWidth: 3, borderColor: Colors.text },
  row: {
    paddingTop: Spacing.two + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.one,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  teamDot: { width: 14, height: 14, borderRadius: 7 },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  nameInactive: { color: Colors.muted, textDecorationLine: 'line-through' },
  meta: { fontSize: 12, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: Spacing.three, paddingBottom: Spacing.one },
  action: { paddingVertical: 2 },
  actionText: { fontSize: 13, fontWeight: '700', color: Colors.navy },
  rosterBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.two,
    gap: 2,
    marginBottom: Spacing.two,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.sm,
  },
  memberRowOn: { backgroundColor: Colors.background },
  memberName: { flex: 1, fontSize: 15, color: Colors.textSecondary },
  memberNameOn: { color: Colors.text, fontWeight: '700' },
  otherTeams: { fontSize: 11, color: Colors.warning },
});
