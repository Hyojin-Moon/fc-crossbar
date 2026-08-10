import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function HomeScreen() {
  const { profile } = useAuth();

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="FC Crossbar"
        subtitle={`${profile?.nickname || profile?.name}님, 반갑습니다`}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <SectionTitle>진행 중인 투표</SectionTitle>
          <Muted>Phase 3 에서 구현됩니다. 여기에 참석 투표 카드가 표시됩니다.</Muted>
        </Card>

        <Card>
          <SectionTitle>다음 일정</SectionTitle>
          <Muted>Phase 3 에서 구현됩니다.</Muted>
        </Card>

        <Card>
          <SectionTitle>내 계정</SectionTitle>
          <Row label="이름" value={profile?.name ?? '-'} />
          <Row label="닉네임" value={profile?.nickname || '-'} />
          <Row label="권한" value={ROLE_LABEL[profile?.role ?? 'member']} />
          <Row label="상태" value={profile?.status ?? '-'} />
        </Card>
      </ScrollView>
    </View>
  );
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: '최고 관리자',
  admin: '관리자',
  member: '일반 회원',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: Colors.textSecondary, fontSize: 14 },
  rowValue: { color: Colors.text, fontSize: 14, fontWeight: '600' },
});
