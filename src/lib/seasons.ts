import { useCallback, useEffect, useState } from 'react';

import { fetchActiveMembers, type MemberBrief } from '@/lib/members';
import { supabase } from '@/lib/supabase';
import type { EventStatus, Season, SeasonStatus } from '@/types/database';

export const SEASON_STATUS_LABEL: Record<SeasonStatus, string> = {
  upcoming: '예정',
  active: '진행 중',
  closed: '종료',
};

export const SEASON_STATUSES: SeasonStatus[] = ['upcoming', 'active', 'closed'];

export async function fetchSeasons(): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function useSeasons() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setSeasons(await fetchSeasons());
    } catch (e) {
      console.warn('[seasons] 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { seasons, loading, reload };
}

export async function fetchSeason(id: string): Promise<Season | null> {
  const { data, error } = await supabase.from('seasons').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export type SeasonInput = {
  name: string;
  start_date: string;
  end_date: string;
  status: SeasonStatus;
  memo: string | null;
};

export async function createSeason(input: SeasonInput, createdBy: string): Promise<string> {
  const { data, error } = await supabase
    .from('seasons')
    .insert({ ...input, created_by: createdBy })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateSeason(id: string, input: Partial<SeasonInput>) {
  const { error } = await supabase.from('seasons').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteSeason(id: string) {
  const { error } = await supabase.from('seasons').delete().eq('id', id);
  if (error) throw error;
}

// --- 시즌 참가 팀과 명단 ---------------------------------------------------

export type SeasonSquad = {
  seasonTeamId: string;
  teamId: string;
  teamName: string;
  color: string | null;
  members: MemberBrief[];
};

type SquadRow = {
  id: string;
  team_id: string;
  teams: { name: string; color: string | null } | null;
  team_members: { member_id: string; profiles: { name: string } | null }[];
};

/** 시즌 참가 팀 + 각 팀 명단을 한 번에. */
export async function fetchSeasonSquads(seasonId: string): Promise<SeasonSquad[]> {
  const { data, error } = await supabase
    .from('season_teams')
    .select('id, team_id, teams(name, color), team_members(member_id, profiles(name))')
    .eq('season_id', seasonId);
  if (error) throw error;

  return ((data ?? []) as unknown as SquadRow[])
    .map((row) => ({
      seasonTeamId: row.id,
      teamId: row.team_id,
      teamName: row.teams?.name ?? '(삭제된 팀)',
      color: row.teams?.color ?? null,
      members: row.team_members
        .map((m) => ({ id: m.member_id, name: m.profiles?.name ?? '(알 수 없음)' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName, 'ko'));
}

export async function addSeasonTeam(seasonId: string, teamId: string) {
  const { error } = await supabase
    .from('season_teams')
    .insert({ season_id: seasonId, team_id: teamId });
  if (error) throw error;
}

/** 참가 팀을 빼면 그 팀의 시즌 명단도 CASCADE 로 함께 사라진다. */
export async function removeSeasonTeam(seasonTeamId: string) {
  const { error } = await supabase.from('season_teams').delete().eq('id', seasonTeamId);
  if (error) throw error;
}

export async function assignToSquad(seasonId: string, seasonTeamId: string, memberId: string) {
  const { error } = await supabase
    .from('team_members')
    .insert({ season_id: seasonId, season_team_id: seasonTeamId, member_id: memberId });
  if (error) throw error;
}

export async function unassignFromSeason(seasonId: string, memberId: string) {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('season_id', seasonId)
    .eq('member_id', memberId);
  if (error) throw error;
}

export type SeasonMatch = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  venue_name: string | null;
  status: EventStatus;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
};

/** 그 시즌의 경기. 순위표와 달리 결과가 아직 없는 경기도 포함한다. */
export async function fetchSeasonMatches(seasonId: string): Promise<SeasonMatch[]> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, event_date, start_time, venue_name, status, home_team_id, away_team_id, home_score, away_score'
    )
    .eq('season_id', seasonId)
    .eq('match_type', 'season')
    .order('event_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SeasonMatch[];
}

/** 지난 시즌 명단 복사. 양쪽 시즌에 같은 팀이 참가할 때만 옮긴다. */
export async function copySeasonRoster(fromSeasonId: string, toSeasonId: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_copy_season_roster', {
    from_season_id: fromSeasonId,
    to_season_id: toSeasonId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * 팀의 기본 명단(team_base_members)을 이 시즌 명단으로 가져온다.
 * 이미 그 시즌에 배정된 회원은 건드리지 않는다 (한 시즌 한 팀 제약).
 * @returns 새로 배정된 인원 수
 */
export async function applyBaseRoster(seasonId: string): Promise<number> {
  const [squads, base, assigned, active] = await Promise.all([
    fetchSeasonSquads(seasonId),
    supabase.from('team_base_members').select('team_id, member_id'),
    supabase.from('team_members').select('member_id').eq('season_id', seasonId),
    fetchActiveMembers(),
  ]);
  if (base.error) throw base.error;
  if (assigned.error) throw assigned.error;

  const squadByTeam = new Map(squads.map((s) => [s.teamId, s.seasonTeamId]));
  const eligible = new Set(active.map((m) => m.id));
  // 이미 이 시즌에 배정된 사람과, 이번 배치에서 이미 담은 사람 둘 다 걸러야 한다.
  // 기본 명단은 한 사람이 여러 팀에 있을 수 있어서 중복이 생기면
  // unique (season_id, member_id) 위반으로 insert 전체가 실패한다.
  const taken = new Set((assigned.data ?? []).map((r) => r.member_id));

  const rows: { season_id: string; season_team_id: string; member_id: string }[] = [];
  for (const row of base.data ?? []) {
    if (!squadByTeam.has(row.team_id)) continue;
    if (taken.has(row.member_id)) continue;
    if (!eligible.has(row.member_id)) continue;
    taken.add(row.member_id);
    rows.push({
      season_id: seasonId,
      season_team_id: squadByTeam.get(row.team_id)!,
      member_id: row.member_id,
    });
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase.from('team_members').insert(rows);
  if (error) throw error;
  return rows.length;
}
