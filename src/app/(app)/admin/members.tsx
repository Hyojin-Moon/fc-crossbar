import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { AppButton, Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  deleteMember,
  fetchAllMembers,
  ROLE_LABEL,
  setMemberRole,
  setMemberStatus,
  STATUS_LABEL,
} from '@/lib/admin';
import { useAuth } from '@/lib/auth-context';
import { confirmAsync } from '@/lib/confirm';
import { describeDbError } from '@/lib/errors';
import type { MemberStatus, Profile } from '@/types/database';

const STATUS_COLOR: Record<MemberStatus, string> = {
  active: Colors.accent,
  pending: Colors.warning,
  inactive: Colors.muted,
};

export default function MembersScreen() {
  const { profile, isSuperAdmin } = useAuth();
  const toast = useToast();

  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await fetchAllMembers());
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const run = async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast(`${label} 완료`);
      await load();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (target: Profile) => {
    const ok = await confirmAsync({
      title: '회원 삭제',
      message: `${target.name} 회원을 삭제합니다. 투표·회비 기록도 함께 삭제됩니다.\n(로그인 계정은 Supabase Dashboard 에서 별도로 지워야 합니다)`,
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    await run('삭제', () => deleteMember(target.id));
  };

  const counts = {
    total: members.length,
    active: members.filter((m) => m.status === 'active').length,
    pending: members.filter((m) => m.status === 'pending').length,
    inactive: members.filter((m) => m.status === 'inactive').length,
  };

  // 승인 대기를 맨 위로 올린다 (관리자가 할 일)
  const sorted = [...members].sort((a, b) => {
    const rank = (m: Profile) => (m.status === 'pending' ? 0 : m.status === 'active' ? 1 : 2);
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko');
  });

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="회원 관리"
        subtitle={`전체 ${counts.total}명`}
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
        <Card>
          <Text style={styles.summary}>
            활성 {counts.active} · 승인 대기 {counts.pending} · 비활성 {counts.inactive}
          </Text>
          {counts.pending > 0 ? (
            <Muted>승인 대기 회원을 &lsquo;활성&rsquo;으로 바꾸면 가입이 승인됩니다.</Muted>
          ) : null}
        </Card>

        {loading ? (
          <ActivityIndicator color={Colors.navy} style={styles.loader} />
        ) : (
          <Card>
            <SectionTitle>회원 목록</SectionTitle>
            <Muted>이름을 누르면 변경 항목이 열립니다.</Muted>

            {sorted.map((member) => {
              const isSelf = member.id === profile?.id;
              const isTargetSuperAdmin = member.role === 'super_admin';
              // admin 은 member 만, super_admin 은 admin 까지 상태를 바꿀 수 있다.
              // super_admin 계정은 누구도 건드릴 수 없다. (RPC 가 다시 검사한다)
              const canChangeStatus =
                !isTargetSuperAdmin && (isSuperAdmin || member.role === 'member');
              const canChangeRole = isSuperAdmin && !isTargetSuperAdmin && !isSelf;
              const canDelete = isSuperAdmin && !isTargetSuperAdmin && !isSelf;
              const open = expanded === member.id;

              return (
                <View key={member.id} style={styles.row}>
                  <Pressable
                    onPress={() => setExpanded(open ? null : member.id)}
                    style={({ pressed }) => [styles.rowHead, pressed && { opacity: 0.7 }]}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[member.status] }]} />
                    <View style={styles.rowText}>
                      <Text style={styles.name} numberOfLines={1}>
                        {member.name}
                        {isSelf ? ' · 나' : ''}
                      </Text>
                      <Text style={styles.meta}>
                        {member.login_id ?? '-'} · {ROLE_LABEL[member.role]} ·{' '}
                        {STATUS_LABEL[member.status]}
                      </Text>
                    </View>
                    <Ionicons
                      name={open ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.muted}
                    />
                  </Pressable>

                  {open ? (
                    <View style={styles.actions}>
                      {isTargetSuperAdmin ? (
                        <Muted>최고 관리자 계정은 앱에서 변경할 수 없습니다.</Muted>
                      ) : null}

                      {canChangeStatus ? (
                        <View style={styles.segment}>
                          {(['active', 'inactive'] as MemberStatus[]).map((status) => {
                            const selected = member.status === status;
                            const color = STATUS_COLOR[status];
                            return (
                              <Pressable
                                key={status}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                disabled={busy || selected}
                                onPress={() =>
                                  void run(STATUS_LABEL[status], () =>
                                    setMemberStatus(member.id, status)
                                  )
                                }
                                style={({ pressed }) => [
                                  styles.segmentButton,
                                  selected
                                    ? { backgroundColor: color, borderColor: color }
                                    : { borderColor: color },
                                  busy && { opacity: 0.5 },
                                  pressed && { opacity: 0.7 },
                                ]}>
                                <Text
                                  style={[
                                    styles.segmentText,
                                    { color: selected ? '#FFFFFF' : color },
                                  ]}>
                                  {STATUS_LABEL[status]}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : !isTargetSuperAdmin ? (
                        <Muted>다른 관리자의 상태는 최고 관리자만 바꿀 수 있습니다.</Muted>
                      ) : null}

                      {canChangeRole ? (
                        member.role === 'member' ? (
                          <AppButton
                            label="관리자로 승격"
                            variant="outline"
                            disabled={busy}
                            onPress={() =>
                              void run('권한 변경', () => setMemberRole(member.id, 'admin'))
                            }
                          />
                        ) : (
                          <AppButton
                            label="일반 회원으로 강등"
                            variant="outline"
                            color={Colors.warning}
                            disabled={busy}
                            onPress={() =>
                              void run('권한 변경', () => setMemberRole(member.id, 'member'))
                            }
                          />
                        )
                      ) : null}

                      {canDelete ? (
                        <AppButton
                          label="회원 삭제"
                          variant="outline"
                          color={Colors.danger}
                          disabled={busy}
                          onPress={() => void onDelete(member)}
                        />
                      ) : null}

                      {isSelf && !isTargetSuperAdmin ? (
                        <Muted>본인 권한은 스스로 바꿀 수 없습니다.</Muted>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
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
  loader: { marginTop: Spacing.five },
  summary: { fontSize: 14, fontWeight: '600', color: Colors.text },
  row: { borderTopWidth: 1, borderTopColor: Colors.border },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
  },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  actions: { gap: Spacing.two, paddingBottom: Spacing.three },
  segment: { flexDirection: 'row', gap: Spacing.two },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 14, fontWeight: '700' },
});
