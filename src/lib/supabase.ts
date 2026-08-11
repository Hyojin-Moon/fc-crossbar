import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import type { Database } from '@/types/database';

/**
 * 긴 값을 셸이나 EAS 대시보드에 붙여 넣다가 줄바꿈이 끼어드는 일이 잦다.
 * 실제로 EAS 에 저장된 anon key 가 143번째 문자에서 개행으로 쪼개져
 * "Unexpected char 0x0a at 150 in Authorization value" 로 로그인이 전부 실패했다.
 * URL 과 JWT 에는 공백 문자가 들어갈 수 없으므로 모두 제거한다.
 */
const clean = (value: string | undefined) => value?.replace(/\s/g, '') || undefined;

const supabaseUrl = clean(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않았습니다.\n' +
      '.env.example 을 .env 로 복사한 뒤 값을 채우고 개발 서버를 다시 시작하세요.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 세션을 기기에 저장 -> 앱을 껐다 켜도 로그인 유지 (자동 로그인).
    // AsyncStorage 는 앱 전용 샌드박스에 저장되어 다른 앱이 읽을 수 없다.
    // expo-secure-store 는 Android 에서 값 2048 바이트 제한이 있는데
    // Supabase 세션 JSON 이 이를 자주 넘기므로 사용하지 않는다.
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // 딥링크에서 세션을 파싱하는 웹 전용 동작. 네이티브에서는 꺼야 한다.
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
