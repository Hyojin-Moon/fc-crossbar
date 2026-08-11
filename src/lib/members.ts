import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type MemberBrief = {
  id: string;
  name: string;
};

/**
 * 팀 명부 = 활성 회원 중 super_admin 을 뺀 사람들.
 *
 * super_admin 은 개발/운영 계정이라 팀원이 아니다. 명부에 섞이면 인원수·참석률·
 * 회비 대상이 오염되므로 일정·통계·회비 화면 전반에서 제외한다.
 * (회원 관리 화면은 계정을 관리하는 곳이라 fetchAllMembers 로 따로 조회한다)
 */
export async function fetchActiveMembers(): Promise<MemberBrief[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('status', 'active')
    .neq('role', 'super_admin')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export function displayName(member: MemberBrief | undefined): string {
  return member?.name ?? '(알 수 없음)';
}

export function useActiveMembers() {
  const [members, setMembers] = useState<MemberBrief[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setMembers(await fetchActiveMembers());
    } catch (e) {
      console.warn('[members] 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  return { members, memberIds, loading, reload };
}
