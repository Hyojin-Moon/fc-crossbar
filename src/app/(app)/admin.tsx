import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { AppButton, Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function AdminScreen() {
  const { isSuperAdmin } = useAuth();

  return (
    <View style={styles.screen}>
      <ScreenHeader title="관리" subtitle={isSuperAdmin ? '최고 관리자' : '관리자'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <SectionTitle>회원 관리 — Phase 5 에서 구현 예정</SectionTitle>
          <Muted>• 회원 목록 · 활성화 / 비활성화</Muted>
          <Muted>• 가입 승인 (승인제 사용 시)</Muted>
          {isSuperAdmin ? <Muted>• 관리자 권한 부여 / 회수 (최고 관리자 전용)</Muted> : null}
        </Card>

        {isSuperAdmin ? (
          <Card>
            <SectionTitle>시스템 — Phase 5 에서 구현 예정</SectionTitle>
            <Muted>• 팀 설정 (팀명, 월 회비 금액, 가입 승인제)</Muted>
            <Muted>• 관리자 활동 로그</Muted>
          </Card>
        ) : null}

        <Card>
          <SectionTitle>내 정보</SectionTitle>
          <AppButton
            label="내 정보 보기"
            variant="outline"
            onPress={() => router.push('/(app)/profile')}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.three, gap: Spacing.three },
});
