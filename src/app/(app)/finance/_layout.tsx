import { Redirect, Stack } from 'expo-router';

import { FullScreenLoader } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

/**
 * 회비 탭. 탭 자체를 관리자에게만 노출하지만, 딥링크로 직접 들어올 수 있으니
 * 여기서도 한 번 더 막는다. (최종 차단은 RLS 가 담당)
 */
export default function FinanceLayout() {
  const { profileLoading, isAdmin } = useAuth();

  if (profileLoading) return <FullScreenLoader />;
  if (!isAdmin) return <Redirect href="/(app)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.surface },
      }}
    />
  );
}
