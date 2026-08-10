import { Redirect, Stack } from 'expo-router';

import { FullScreenLoader } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function AdminLayout() {
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
