import { Alert, Platform } from 'react-native';

/**
 * 확인 다이얼로그.
 *
 * react-native-web 의 Alert.alert() 는 본문이 빈 스텁이라 웹에서는 아무 일도 일어나지 않는다.
 * 버튼의 onPress 조차 호출되지 않으므로 확인이 필요한 동작 전체가 먹통이 된다.
 * 그래서 웹에서는 window.confirm 을 쓴다.
 *
 * 안내 메시지(확인 버튼만 있는 알림)에는 이 함수를 쓰지 말고 useToast() 를 쓴다.
 */
export function confirmAsync(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const {
    title,
    message = '',
    confirmLabel = '확인',
    cancelLabel = '취소',
    destructive = false,
  } = options;

  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    // eslint-disable-next-line no-alert
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(text) : false);
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message || undefined,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
