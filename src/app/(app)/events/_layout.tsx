import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

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
