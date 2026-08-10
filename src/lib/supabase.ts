import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
    // access token 만료 시 refresh token 으로 자동 갱신
    autoRefreshToken: true,
    // 딥링크에서 세션을 파싱하는 웹 전용 동작. 네이티브에서는 꺼야 한다.
    detectSessionInUrl: false,
  },
});

// 앱이 백그라운드로 가면 갱신 타이머를 멈추고, 돌아오면 다시 시작한다.
// 이 처리가 없으면 앱을 오래 백그라운드에 둔 뒤 복귀했을 때 토큰이 만료된 채로 남는다.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
