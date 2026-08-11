import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { MatchType, Venue } from '@/types/database';

export const MATCH_TYPES: MatchType[] = ['season', 'regular', 'etc'];

export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  season: '시즌경기',
  regular: '일반경기',
  etc: '기타',
};

/**
 * 경기장을 미리 등록해 두고 일정 생성 시 고른다.
 * 고르면 events.venue_name / venue_address 에 값을 '복사'해 넣는다 —
 * 나중에 경기장 정보가 바뀌어도 지난 경기 기록은 당시 값을 유지해야 한다.
 */
export async function fetchVenues(includeInactive = false): Promise<Venue[]> {
  let query = supabase.from('venues').select('*').order('sort_order').order('name');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export function useVenues(includeInactive = false) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setVenues(await fetchVenues(includeInactive));
    } catch (e) {
      console.warn('[venues] 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { venues, loading, reload };
}

export type VenueInput = {
  name: string;
  address: string | null;
  map_url: string | null;
  memo: string | null;
  is_active: boolean;
};

export async function createVenue(input: VenueInput) {
  const { error } = await supabase.from('venues').insert(input);
  if (error) throw error;
}

export async function updateVenue(id: string, input: Partial<VenueInput>) {
  const { error } = await supabase.from('venues').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteVenue(id: string) {
  const { error } = await supabase.from('venues').delete().eq('id', id);
  if (error) throw error;
}
