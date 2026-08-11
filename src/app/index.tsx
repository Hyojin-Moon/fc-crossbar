import { Redirect } from 'expo-router';

import { FullScreenLoader } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';

export default function Index() {
  const { initializing, session } = useAuth();

  if (initializing) return <FullScreenLoader />;
  return <Redirect href={session ? '/(app)' : '/(auth)/sign-in'} />;
}
