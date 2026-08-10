import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';

/** 아직 구현되지 않은 Phase 의 자리 표시 화면. */
export function PlaceholderScreen({
  title,
  subtitle,
  phase,
  items,
}: {
  title: string;
  subtitle?: string;
  phase: string;
  items: string[];
}) {
  return (
    <View style={styles.screen}>
      <ScreenHeader title={title} subtitle={subtitle} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <SectionTitle>{phase} 에서 구현 예정</SectionTitle>
          {items.map((item) => (
            <Muted key={item}>• {item}</Muted>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.three, gap: Spacing.three },
});
