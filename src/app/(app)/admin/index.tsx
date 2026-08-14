import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Muted, SectionTitle, Screen, ScreenScroll } from '@/components/ui';
import { Colors, Radius, Spacing, Typography, Weight } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings';

export default function AdminMenuScreen() {
  const { isSuperAdmin } = useAuth();
  const settings = useSettings();

  return (
    <Screen>
      <ScreenHeader title="관리" subtitle={isSuperAdmin ? '최고 관리자' : '관리자'} />
      <ScreenScroll>
        <View style={styles.group}>
          <SectionTitle>팀 운영</SectionTitle>
          <MenuRow
            icon="people"
            title="회원 관리"
            subtitle="활성화 / 비활성화 · 가입 승인"
            onPress={() => router.push('/(app)/admin/members')}
          />
          <MenuRow
            icon="shirt"
            title="팀 관리"
            subtitle="시즌과 무관하게 팀을 만들고 기본 명단을 지정한다"
            onPress={() => router.push('/(app)/admin/teams')}
          />
          <MenuRow
            icon="trophy"
            title="시즌 관리"
            subtitle="기간 · 참가 팀 · 시즌별 명단"
            onPress={() => router.push('/(app)/admin/seasons')}
          />
          <MenuRow
            icon="location"
            title="경기장 관리"
            subtitle="미리 등록해 두면 일정 만들 때 골라 쓴다"
            onPress={() => router.push('/(app)/admin/venues')}
          />
          <MenuRow
            icon="download-outline"
            title="데이터 내보내기"
            subtitle="회원 · 회비 · 지출 · 참석률 CSV"
            onPress={() => router.push('/(app)/admin/export')}
          />
        </View>

        {isSuperAdmin ? (
          <View style={styles.group}>
            <SectionTitle>시스템</SectionTitle>
            <MenuRow
              icon="settings"
              title="팀 설정"
              subtitle={`${settings.teamName} · 월 회비 ${settings.monthlyFeeAmount.toLocaleString('ko-KR')}원`}
              onPress={() => router.push('/(app)/admin/settings')}
            />
            <MenuRow
              icon="document-text"
              title="관리자 활동 로그"
              subtitle="권한 · 상태 변경 기록"
              onPress={() => router.push('/(app)/admin/logs')}
            />
          </View>
        ) : (
          <View style={styles.group}>
            <SectionTitle>시스템</SectionTitle>
            <Muted>팀 설정과 활동 로그는 최고 관리자만 볼 수 있습니다.</Muted>
          </View>
        )}

        <View style={styles.group}>
          <SectionTitle>내 계정</SectionTitle>
          <MenuRow
            icon="person"
            title="내 정보"
            subtitle="프로필 수정 · 로그아웃"
            onPress={() => router.push('/(app)/profile')}
          />
        </View>
      </ScreenScroll>
    </Screen>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={20} color={Colors.navy} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: Spacing.half },
  title: { ...Typography.bodyLarge, fontWeight: Weight.bold, color: Colors.text },
  subtitle: { ...Typography.caption, color: Colors.textSecondary },
});
