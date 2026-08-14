import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import {
  AppButton,
  Card,
  InlineLoader,
  ListRow,
  Muted,
  SectionTitle,
  Screen,
  ScreenScroll,
  SegmentedControl,
} from '@/components/ui';
import { Colors, Typography, Weight } from '@/constants/theme';
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

  const sorted = [...members].sort((a, b) => {
    const rank = (m: Profile) => (m.status === 'pending' ? 0 : m.status === 'active' ? 1 : 2);
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko');
  });

  return (
    <Screen>
      <ScreenHeader title="회원 관리" subtitle={`전체 ${counts.total}명`} onBack={() => router.back()} />

      <ScreenScroll>
        <Card>
          <Text style={styles.summary}>
            활성 {counts.active} · 승인 대기 {counts.pending} · 비활성 {counts.inactive}
          </Text>
          {counts.pending > 0 ? (
            <Muted>승인 대기 회원을 &lsquo;활성&rsquo;으로 바꾸면 가입이 승인됩니다.</Muted>
          ) : null}
        </Card>

        {loading ? (
          <InlineLoader />
        ) : (
          <Card>
            <SectionTitle>회원 목록</SectionTitle>
            <Muted>이름을 누르면 변경 항목이 열립니다.</Muted>

            {sorted.map((member, index) => {
              const isSelf = member.id === profile?.id;
              const isTargetSuperAdmin = member.role === 'super_admin';
              // admin 은 member 만, super_admin 은 admin 까지 상태를 바꿀 수 있다.
              // super_admin 계정은 누구도 건드릴 수 없다. (RPC 가 다시 검사한다)
              const canChangeStatus =
                !isTargetSuperAdmin && (isSuperAdmin || member.role === 'member');
              const canChangeRole = isSuperAdmin && !isTargetSuperAdmin && !isSelf;
              const canDelete = isSuperAdmin && !isTargetSuperAdmin && !isSelf;
              const open = expanded === member.id;
              const statusValue: MemberStatus | null =
                member.status === 'active' || member.status === 'inactive' ? member.status : null;

              return (
                <ListRow
                  key={member.id}
                  first={index === 0}
                  dotColor={STATUS_COLOR[member.status]}
                  title={`${member.name}${isSelf ? ' · 나' : ''}`}
                  meta={`${member.login_id ?? '-'} · ${ROLE_LABEL[member.role]} · ${
                    STATUS_LABEL[member.status]
                  }`}
                  expanded={open}
                  onPress={() => setExpanded(open ? null : member.id)}>
                  {isTargetSuperAdmin ? (
                    <Muted>최고 관리자 계정은 앱에서 변경할 수 없습니다.</Muted>
                  ) : null}

                  {canChangeStatus ? (
                    <SegmentedControl
                      options={(['active', 'inactive'] as MemberStatus[]).map((status) => ({
                        value: status,
                        label: STATUS_LABEL[status],
                        color: STATUS_COLOR[status],
                      }))}
                      value={statusValue}
                      disabled={busy}
                      onChange={(status) => {
                        if (status === member.status) return;
                        void run(STATUS_LABEL[status], () => setMemberStatus(member.id, status));
                      }}
                    />
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
                </ListRow>
              );
            })}
          </Card>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { ...Typography.body, fontWeight: Weight.semibold, color: Colors.text },
});
