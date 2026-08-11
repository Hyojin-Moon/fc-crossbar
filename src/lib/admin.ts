import { supabase } from '@/lib/supabase';
import type { AdminAuditLog, MemberStatus, Profile, Role } from '@/types/database';

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: '최고 관리자',
  admin: '관리자',
  member: '일반 회원',
};

export const STATUS_LABEL: Record<MemberStatus, string> = {
  active: '활성',
  pending: '승인 대기',
  inactive: '비활성',
};

export async function fetchAllMembers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('role')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/**
 * 아래 세 함수는 모두 SECURITY DEFINER RPC 를 호출한다.
 * 클라이언트는 profiles.role / status 를 직접 UPDATE 할 권한이 없고(컬럼 GRANT),
 * RPC 안에서 호출자의 role 을 다시 검증한 뒤 admin_audit_logs 에 기록한다.
 */
export async function setMemberRole(targetProfileId: string, newRole: 'admin' | 'member') {
  const { error } = await supabase.rpc('admin_set_member_role', {
    target_profile_id: targetProfileId,
    new_role: newRole,
  });
  if (error) throw error;
}

export async function setMemberStatus(targetProfileId: string, newStatus: MemberStatus) {
  const { error } = await supabase.rpc('admin_set_member_status', {
    target_profile_id: targetProfileId,
    new_status: newStatus,
  });
  if (error) throw error;
}

export async function deleteMember(targetProfileId: string) {
  const { error } = await supabase.rpc('admin_delete_member', {
    target_profile_id: targetProfileId,
  });
  if (error) throw error;
}

export type AuditLogRow = AdminAuditLog & {
  actor: { name: string; login_id: string | null } | null;
};

/** super_admin 만 조회 가능 (RLS). actor_id 는 profiles 로 가는 유일한 FK 라 임베드가 모호하지 않다. */
export async function fetchAuditLogs(limit = 100): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from('admin_audit_logs')
    .select('*, actor:profiles(name, login_id)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AuditLogRow[];
}

export const ACTION_LABEL: Record<string, string> = {
  set_role: '권한 변경',
  set_status: '상태 변경',
  delete_member: '회원 삭제',
};

export function describeAuditDetail(action: string, detail: unknown): string {
  if (!detail || typeof detail !== 'object') return '';
  const d = detail as Record<string, unknown>;
  if (action === 'set_role' && typeof d.new_role === 'string') {
    return `→ ${ROLE_LABEL[d.new_role as Role] ?? d.new_role}`;
  }
  if (action === 'set_status' && typeof d.new_status === 'string') {
    return `→ ${STATUS_LABEL[d.new_status as MemberStatus] ?? d.new_status}`;
  }
  if (action === 'delete_member' && typeof d.name === 'string') {
    return `${d.name}`;
  }
  return '';
}
