/**
 * FC Crossbar 디자인 토큰.
 * 흰 배경 + 다크 네이비 포인트. 팀 내부용이라 다크모드는 지원하지 않는다.
 */

import { Platform } from 'react-native';

export const Colors = {
  /** 헤더/주요 버튼에 쓰는 다크 네이비 */
  navy: '#12263F',
  navyDark: '#0B1728',
  navySoft: '#1E3A5F',

  /** 참석 */
  accent: '#1B9C6A',
  /** 불참 */
  danger: '#D9483B',
  /** 미정 */
  warning: '#E8A33D',
  /** 미투표 */
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
} as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});

export const MaxContentWidth = 800;
