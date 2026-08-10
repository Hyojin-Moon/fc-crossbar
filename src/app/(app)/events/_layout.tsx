import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/** 일정 탭 안에서 목록 -> 상세 -> 작성 화면으로 쌓이도록 Stack 을 둔다. */
export default function EventsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.surface },
      }}
    />
  );
}
