import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { TeamWithRoster } from '@/types/database';

/**
 * 팀은 시즌과 무관하게 존재한다.
 *  - team_base_members : 기본 명단 (시즌 없이도 배정 가능)
 *  - team_members      : 시즌별 명단 스냅샷 (0011). 여기서 건드리지 않는다
 * 기본 명단을 고쳐도 지난 시즌 기록의 소속은 바뀌지 않는다.
 */

/** 팀 색 후보. 투표·출석 색과 겹치지 않게 고른 값들. */
export const TEAM_COLORS = [
  '#1B9C6A',
  '#D9483B',
  '#2F6FB5',
  '#E8A33D',
  '#7A4FBF',
  '#12263F',
] as const;

export async function fetchTeams(): Promise<TeamWithRoster[]> {
  const { data, error } = await supabase.rpc('get_teams_with_base_roster');
  if (error) throw error;
  return (data ?? []) as TeamWithRoster[];
}

export function useTeams() {
  const [teams, setTeams] = useState<TeamWithRoster[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setTeams(await fetchTeams());
    } catch (e) {
      console.warn('[teams] 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { teams, loading, reload };
}

export type TeamInput = {
  name: string;
  color: string | null;
  memo: string | null;
  is_active: boolean;
};

export async function createTeam(input: TeamInput) {
  const { error } = await supabase.from('teams').insert(input);
  if (error) throw error;
}

export async function updateTeam(id: string, input: Partial<TeamInput>) {
  const { error } = await supabase.from('teams').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteTeam(id: string) {
  const { error } = await supabase.from('teams').delete().eq('id', id);
  if (error) throw error;
}

// --- 기본 명단 ------------------------------------------------------------

export type BaseRosterRow = { team_id: string; member_id: string };

/** 전체 팀의 기본 명단. 한 사람이 여러 팀에 있는지 화면에서 판단하려면 전부 필요하다. */
export async function fetchBaseRoster(): Promise<BaseRosterRow[]> {
  const { data, error } = await supabase.from('team_base_members').select('team_id, member_id');
  if (error) throw error;
  return data ?? [];
}

export async function addToBaseRoster(teamId: string, memberId: string) {
  const { error } = await supabase
    .from('team_base_members')
    .insert({ team_id: teamId, member_id: memberId });
  if (error) throw error;
}

export async function removeFromBaseRoster(teamId: string, memberId: string) {
  const { error } = await supabase
    .from('team_base_members')
    .delete()
    .eq('team_id', teamId)
    .eq('member_id', memberId);
  if (error) throw error;
}
