import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/**
 * 회비 탭. 일반회원도 들어올 수 있다 (잔액 · 지출 · 본인 납부 읽기 전용).
 * 화면별로 관리자 기능을 가리고, 실제 차단은 RLS 가 담당한다.
 */
export default function FinanceLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.surface },
      }}
    />
  );
}
