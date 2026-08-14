import { useWindowDimensions } from 'react-native';

import { Breakpoints } from '@/constants/theme';

export type Breakpoint = 'compact' | 'wide';

export function useBreakpoint(): {
  width: number;
  bp: Breakpoint;
  isWide: boolean;
} {
  const { width } = useWindowDimensions();
  const isWide = width >= Breakpoints.wide;

  return { width, bp: isWide ? 'wide' : 'compact', isWide };
}
