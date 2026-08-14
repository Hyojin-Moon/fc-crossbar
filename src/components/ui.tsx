import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { Colors, MaxContentWidth, Radius, Spacing, Typography, Weight } from '@/constants/theme';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

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

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function ScreenScroll({
  children,
  fullWidth,
  refreshControl,
}: {
  children: ReactNode;
  fullWidth?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.scrollOuter}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}>
      <View style={[styles.scrollInner, !fullWidth && styles.scrollInnerBounded]}>
        {children}
      </View>
    </ScrollView>
  );
}

export function EmptyState({
  message,
  icon,
  action,
}: {
  message: string;
  icon?: IoniconName;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.emptyState}>
      {icon ? <Ionicons name={icon} size={28} color={Colors.muted} /> : null}
      <Text style={styles.emptyMessage}>{message}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.7 }]}>
          <Text style={styles.emptyActionLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function InlineLoader({ spacing = 'top' }: { spacing?: 'top' | 'vertical' }) {
  return (
    <ActivityIndicator
      color={Colors.navy}
      style={spacing === 'top' ? styles.inlineLoaderTop : styles.inlineLoaderVertical}
    />
  );
}

type ListRowProps = {
  title: string;
  meta?: string;
  dotColor?: string;
  leading?: ReactNode;
  trailing?: ReactNode | string;
  expanded?: boolean;
  onPress?: () => void;
  highlighted?: boolean;
  first?: boolean;
  children?: ReactNode;
};

export function ListRow({
  title,
  meta,
  dotColor,
  leading,
  trailing,
  expanded,
  onPress,
  highlighted,
  first,
  children,
}: ListRowProps) {
  const chevronName: IoniconName | undefined =
    expanded === true ? 'chevron-up' : expanded === false ? 'chevron-down' : undefined;

  const rowBody = (
    <View style={[styles.row, highlighted && styles.rowHighlighted]}>
      {dotColor ? <View style={[styles.rowDot, { backgroundColor: dotColor }]} /> : null}
      {leading}
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing != null ? (
        typeof trailing === 'string' ? (
          <Text style={styles.rowTrailing}>{trailing}</Text>
        ) : (
          trailing
        )
      ) : null}
      {chevronName ? <Ionicons name={chevronName} size={16} color={Colors.muted} /> : null}
    </View>
  );

  return (
    <View style={!first && styles.rowGroupDivider}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [pressed && styles.rowPressed]}>
          {rowBody}
        </Pressable>
      ) : (
        rowBody
      )}
      {expanded && children ? <View style={styles.rowExpanded}>{children}</View> : null}
    </View>
  );
}

export function ChipRow<T extends string | null>({
  items,
  value,
  onChange,
  layout = 'scroll',
  bar,
}: {
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  layout?: 'scroll' | 'wrap';
  bar?: boolean;
}) {
  const chips = items.map((item) => {
    const active = item.value === value;
    return (
      <Pressable
        key={String(item.value)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(item.value)}
        style={[styles.chip, active && styles.chipActive]}>
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
      </Pressable>
    );
  });

  const content =
    layout === 'wrap' ? (
      <View style={styles.chipWrap}>{chips}</View>
    ) : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}>
        {chips}
      </ScrollView>
    );

  return bar ? <View style={styles.chipBar}>{content}</View> : content;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  dimmed,
}: {
  options: readonly { value: T; label: string; color?: string }[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  dimmed?: boolean;
}) {
  return (
    <View style={[styles.segment, dimmed && styles.segmentDimmed]}>
      {options.map((opt) => {
        const active = opt.value === value;
        const color = opt.color ?? Colors.navy;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.segmentItem,
              active ? { backgroundColor: color, borderColor: color } : { borderColor: color },
              disabled && styles.segmentItemDisabled,
              pressed && !disabled && styles.segmentItemPressed,
            ]}>
            <Text style={[styles.segmentLabel, { color: active ? Colors.textOnNavy : color }]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: {
    ...Typography.title,
    fontWeight: Weight.bold,
    color: Colors.text,
  },
  muted: {
    ...Typography.body,
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
  buttonLabel: { ...Typography.bodyLarge, fontWeight: Weight.bold },
  field: { gap: Spacing.one },
  fieldLabel: { ...Typography.body, fontWeight: Weight.semibold, color: Colors.textSecondary },
  input: {
    // 웹에서 두 칸 배치 시 컨테이너를 넘치지 않도록 (datetime-input.tsx 참고)
    minWidth: 0,
    minHeight: 50,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    ...Typography.bodyLarge,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  fieldHint: { ...Typography.caption, color: Colors.textSecondary },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  screen: { flex: 1, backgroundColor: Colors.surface },
  scrollOuter: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    alignItems: 'center',
  },
  scrollInner: {
    width: '100%',
    gap: Spacing.three,
  },
  scrollInnerBounded: { maxWidth: MaxContentWidth },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  emptyMessage: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
  emptyAction: {
    marginTop: Spacing.one,
    paddingVertical: Spacing.oneHalf,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.sm,
    backgroundColor: Colors.navy,
  },
  emptyActionLabel: { ...Typography.body, fontWeight: Weight.semibold, color: Colors.textOnNavy },
  inlineLoaderTop: { marginTop: Spacing.five },
  inlineLoaderVertical: { marginVertical: Spacing.four },
  rowGroupDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowPressed: { opacity: 0.7 },
  rowHighlighted: { backgroundColor: Colors.surface },
  rowDot: { width: Spacing.two, height: Spacing.two, borderRadius: Spacing.one },
  rowMain: { flex: 1, minWidth: 0, gap: Spacing.half },
  rowTitle: { ...Typography.bodyLarge, fontWeight: Weight.semibold, color: Colors.text },
  rowMeta: { ...Typography.caption, color: Colors.textSecondary },
  rowTrailing: {
    ...Typography.bodyLarge,
    fontWeight: Weight.semibold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  rowExpanded: { paddingBottom: Spacing.two },
  chip: {
    paddingVertical: Spacing.oneHalf,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  chipText: { ...Typography.body, fontWeight: Weight.semibold, color: Colors.textSecondary },
  chipTextActive: { color: Colors.textOnNavy },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chipScroll: { flexDirection: 'row', gap: Spacing.two },
  chipBar: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  segment: { flexDirection: 'row', gap: Spacing.two },
  segmentDimmed: { opacity: 0.5 },
  segmentItem: {
    flex: 1,
    minHeight: 42,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemDisabled: { opacity: 0.5 },
  segmentItemPressed: { opacity: 0.75 },
  segmentLabel: { ...Typography.body, fontWeight: Weight.bold },
});
