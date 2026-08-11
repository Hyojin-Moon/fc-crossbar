import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

export function Card({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewProps['style'];
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  color = Colors.navy,
  disabled,
  loading,
  style,
}: ButtonProps) {
  const isSolid = variant === 'primary';
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        isSolid ? { backgroundColor: color } : styles.buttonOutline,
        variant === 'outline' && { borderColor: color },
        variant === 'ghost' && styles.buttonGhost,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={isSolid ? Colors.textOnNavy : color} />
      ) : (
        <Text style={[styles.buttonLabel, { color: isSolid ? Colors.textOnNavy : color }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; hint?: string };

export function Field({ label, hint, style, ...rest }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={Colors.muted}
        style={[styles.input, style]}
        {...rest}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function FullScreenLoader() {
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color={Colors.navy} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  muted: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  button: {
    minHeight: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  buttonOutline: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.navy,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    minHeight: 40,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.75 },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  field: { gap: Spacing.one },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  input: {
    // 웹에서 두 칸 배치 시 컨테이너를 넘치지 않도록 (datetime-input.tsx 참고)
    minWidth: 0,
    minHeight: 50,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  fieldHint: { fontSize: 12, color: Colors.muted },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
