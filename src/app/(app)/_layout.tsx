import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { BlockedNotice } from '@/components/blocked-notice';
import { FullScreenLoader } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function AppLayout() {
  const { initializing, session, profile, profileLoading, isAdmin } = useAuth();

  if (initializing || profileLoading) return <FullScreenLoader />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (!profile) return <BlockedNotice reason="missing" />;
  if (profile.status !== 'active') return <BlockedNotice reason={profile.status} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // 탭을 떠나면 그 탭의 중첩 스택을 첫 화면으로 되돌린다
        popToTopOnBlur: true,
        tabBarActiveTintColor: Colors.navy,
        tabBarInactiveTintColor: Colors.muted,
        // height 를 고정하면 edge-to-edge 환경에서 제스처 바에 가린다
        tabBarStyle: { borderTopColor: Colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: '일정',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: '통계',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      />
      {/* 회비 탭은 전원에게 보인다. 일반회원은 잔액·지출·본인 납부만 읽기 전용으로 본다.
          쓰기와 '남의 납부 상황'은 RLS 가 막는다. */}
      <Tabs.Screen
        name="finance"
        options={{
          title: '회비',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} />,
        }}
      />
      {/* href: undefined = 표시, null = 숨김 */}
      <Tabs.Screen
        name="admin"
        options={{
          title: '관리',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          href: isAdmin ? null : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
