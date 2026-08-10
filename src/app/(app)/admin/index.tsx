import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings';

export default function AdminMenuScreen() {
  const { isSuperAdmin } = useAuth();
  const settings = useSettings();

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="관리"
        subtitle={isSuperAdmin ? '최고 관리자' : '관리자'}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          <SectionTitle>팀 운영</SectionTitle>
          <MenuRow
            icon="people"
            title="회원 관리"
            subtitle="활성화 / 비활성화 · 가입 승인"
            onPress={() => router.push('/(app)/admin/members')}
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
      </ScrollView>
    </View>
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
  screen: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
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
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textSecondary },
});
