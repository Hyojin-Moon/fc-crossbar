
import { Platform } from 'react-native';

export const Colors = {
  navy: '#12263F',
  navyDark: '#0B1728',
  navySoft: '#1E3A5F',

  accent: '#1B9C6A',
  danger: '#D9483B',
  warning: '#E8A33D',
  muted: '#9AA4B2',

  background: '#FFFFFF',
  surface: '#F5F7FA',
  border: '#E3E8EF',

  text: '#12263F',
  textSecondary: '#5B6B7F',
  textOnNavy: '#FFFFFF',
} as const;

/** 투표 선택지별 색상. vote_options.code 와 매칭된다. */
export const VoteColors: Record<string, string> = {
  attend: Colors.accent,
  absent: Colors.danger,
  maybe: Colors.warning,
  late: Colors.warning,
  early_leave: Colors.warning,
  guest: Colors.navySoft,
  none: Colors.muted,
};

export const Spacing = {
  half: 2,
  one: 4,
  oneHalf: 6,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});

export const MaxContentWidth = 800;

export const Breakpoints = { wide: 800 } as const;

export const Typography = {
  micro: { fontSize: 10, lineHeight: 13 },
  caption: { fontSize: 12, lineHeight: 16 },
  body: { fontSize: 13, lineHeight: 17 },
  bodyLarge: { fontSize: 15, lineHeight: 19 },
  title: { fontSize: 19, lineHeight: 23 },
  titleLarge: { fontSize: 22, lineHeight: 26 },
  headline: { fontSize: 26, lineHeight: 31 },
  display: { fontSize: 34, lineHeight: 38 },
  displayLarge: { fontSize: 40, lineHeight: 44 },
} as const;

export const Weight = {
  regular: '400',
  semibold: '600',
  bold: '700',
} as const;
