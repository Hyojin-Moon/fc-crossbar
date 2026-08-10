import { Redirect, Stack } from 'expo-router';

import { FullScreenLoader } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function AuthLayout() {
  const { initializing, session } = useAuth();

  if (initializing) return <FullScreenLoader />;
  if (session) return <Redirect href="/(app)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}
