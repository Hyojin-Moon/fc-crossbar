import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type AppSettings = {
  teamName: string;
  monthlyFeeAmount: number;
  /** 연초에 한 번에 낼 때의 할인 금액 (월 회비 × 12 보다 싸다) */
  annualFeeAmount: number;
  requireApproval: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  teamName: 'FC Crossbar',
  monthlyFeeAmount: 30000,
  annualFeeAmount: 300000,
  requireApproval: false,
};

const KEYS = {
  teamName: 'team_name',
  monthlyFeeAmount: 'monthly_fee_amount',
  annualFeeAmount: 'annual_fee_amount',
  requireApproval: 'require_approval',
} as const;

let cache: AppSettings | null = null;
let inflight: Promise<AppSettings> | null = null;

// 홈 화면처럼 탭에 이미 마운트된 화면은 effect 가 다시 돌지 않는다.
// 캐시만 비우면 아무도 다시 읽지 않으므로, 값이 바뀌면 구독자에게 직접 알린다.
type Listener = (next: AppSettings) => void;
const listeners = new Set<Listener>();

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
    annualFeeAmount: Number(map.get(KEYS.annualFeeAmount) ?? DEFAULT_SETTINGS.annualFeeAmount),
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

export function invalidateSettings() {
  cache = null;
  void loadSettings().then((next) => {
    for (const listener of listeners) listener(next);
  });
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => cache ?? DEFAULT_SETTINGS);

  useEffect(() => {
    let alive = true;
    const listener: Listener = (next) => {
      if (alive) setSettings(next);
    };
    listeners.add(listener);
    void loadSettings().then((next) => {
      if (alive) setSettings(next);
    });
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  return settings;
}

/**
 * super_admin 전용 (RLS 가 다시 검사한다).
 * 모든 값을 한 번의 요청으로 저장하고 갱신을 한 번만 알린다.
 */
export async function saveSettings(next: AppSettings) {
  const { error } = await supabase.from('app_settings').upsert(
    [
      { key: KEYS.teamName, value: next.teamName },
      { key: KEYS.monthlyFeeAmount, value: next.monthlyFeeAmount },
      { key: KEYS.annualFeeAmount, value: next.annualFeeAmount },
      { key: KEYS.requireApproval, value: next.requireApproval },
    ],
    { onConflict: 'key' }
  );
  if (error) throw error;
  invalidateSettings();
}
