import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * app_settings 는 거의 바뀌지 않고 홈 화면 헤더처럼 자주 그려지는 곳에서 쓰이므로
 * vote-options 와 같은 방식으로 모듈 레벨에 캐시한다.
 */
export type AppSettings = {
  teamName: string;
  monthlyFeeAmount: number;
  requireApproval: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  teamName: 'FC Crossbar',
  monthlyFeeAmount: 30000,
  requireApproval: false,
};

const KEYS = {
  teamName: 'team_name',
  monthlyFeeAmount: 'monthly_fee_amount',
  requireApproval: 'require_approval',
} as const;

let cache: AppSettings | null = null;
let inflight: Promise<AppSettings> | null = null;

async function fetchSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.from('app_settings').select('key, value');
  if (error || !data) {
    if (error) console.warn('[settings] 조회 실패, 기본값 사용:', error.message);
    return DEFAULT_SETTINGS;
  }

  const map = new Map(data.map((row) => [row.key, row.value]));
  const next: AppSettings = {
    teamName: String(map.get(KEYS.teamName) ?? DEFAULT_SETTINGS.teamName),
    monthlyFeeAmount: Number(map.get(KEYS.monthlyFeeAmount) ?? DEFAULT_SETTINGS.monthlyFeeAmount),
    requireApproval: Boolean(map.get(KEYS.requireApproval) ?? DEFAULT_SETTINGS.requireApproval),
  };
  cache = next;
  return next;
}

export async function loadSettings(): Promise<AppSettings> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetchSettings().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** 설정을 바꾼 뒤 호출해서 캐시를 비운다. */
export function invalidateSettings() {
  cache = null;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => cache ?? DEFAULT_SETTINGS);

  useEffect(() => {
    let alive = true;
    void loadSettings().then((next) => {
      if (alive) setSettings(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return settings;
}

/** super_admin 전용. RLS 가 다시 검사한다. */
export async function saveSetting(key: keyof typeof KEYS, value: unknown) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: KEYS[key], value }, { onConflict: 'key' });
  if (error) throw error;
  invalidateSettings();
}
