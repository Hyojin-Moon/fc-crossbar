import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type MemberBrief = {
  id: string;
  name: string;
  nickname: string | null;
};

/** 활성 회원 목록. 미투표 인원과 명단을 계산하려면 전체 명부가 필요하다. */
export async function fetchActiveMembers(): Promise<MemberBrief[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, nickname')
    .eq('status', 'active')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export function displayName(member: MemberBrief | undefined): string {
  if (!member) return '(알 수 없음)';
  return member.nickname?.trim() ? `${member.name} (${member.nickname})` : member.name;
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

  return { members, loading, reload };
}
