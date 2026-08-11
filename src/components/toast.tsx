import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

type ToastKind = 'success' | 'error' | 'info';
type ToastState = { message: string; kind: ToastKind } | null;

const ToastContext = createContext<((message: string, kind?: ToastKind) => void) | null>(null);

// 웹에는 네이티브 애니메이션 모듈이 없어 useNativeDriver: true 면 콘솔 경고가 뜬다.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const BACKGROUND: Record<ToastKind, string> = {
  success: Colors.accent,
  error: Colors.danger,
  info: Colors.navy,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, kind });
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start(({ finished }) => {
          if (finished) setToast(null);
        });
      }, 1800);
    },
    [opacity]
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none">
          <View style={[styles.toast, { backgroundColor: BACKGROUND[toast.kind] }]}>
            <Text style={styles.text}>{toast.message}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast 는 ToastProvider 안에서만 사용할 수 있습니다.');
  return show;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    bottom: 96,
    alignItems: 'center',
  },
  toast: {
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    maxWidth: '100%',
  },
  text: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
