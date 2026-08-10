import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

type Reason = 'pending' | 'inactive' | 'missing';

const MESSAGES: Record<Reason, { title: string; body: string }> = {
  pending: {
    title: '가입 승인 대기 중',
    body: '관리자가 가입을 승인하면 이용할 수 있습니다.',
  },
  inactive: {
    title: '비활성화된 계정',
    body: '계정이 비활성화되어 있습니다. 팀 관리자에게 문의해 주세요.',
  },
  missing: {
    title: '회원 정보를 찾을 수 없습니다',
    body: '프로필이 생성되지 않았습니다. 관리자에게 문의해 주세요.',
  },
};

export function BlockedNotice({ reason }: { reason: Reason }) {
  const { signOut, refreshProfile } = useAuth();
  const { title, body } = MESSAGES[reason];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <AppButton label="다시 확인" variant="outline" onPress={() => void refreshProfile()} />
        <AppButton label="로그아웃" variant="ghost" onPress={() => void signOut()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  title: { fontSize: 22, fontWeight: '800', color: Colors.navy, textAlign: 'center' },
  body: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
});
