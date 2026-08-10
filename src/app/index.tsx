import { Redirect } from 'expo-router';

import { FullScreenLoader } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';

/** 진입점. 세션 유무에 따라 로그인 화면 또는 앱으로 보낸다. */
export default function Index() {
  const { initializing, session } = useAuth();

  if (initializing) return <FullScreenLoader />;
  return <Redirect href={session ? '/(app)' : '/(auth)/sign-in'} />;
}
