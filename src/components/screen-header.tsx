import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Spacing, Typography, Weight } from '@/constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  fullWidth?: boolean;
};

export function ScreenHeader({ title, subtitle, onBack, right, fullWidth }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
      <View style={[styles.inner, !fullWidth && styles.innerBounded]}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right}
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로"
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={20} color={Colors.textOnNavy} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.navy,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  inner: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  innerBounded: { maxWidth: MaxContentWidth },
  textBlock: { gap: Spacing.half, flexShrink: 1 },
  title: { ...Typography.titleLarge, fontWeight: Weight.bold, color: Colors.textOnNavy },
  subtitle: { ...Typography.body, color: '#B9C6D6' },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
