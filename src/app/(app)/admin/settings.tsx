import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { AppButton, Card, Field, Muted, SectionTitle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { describeDbError } from '@/lib/errors';
import { formatWon } from '@/lib/finance';
import { loadSettings, saveSetting } from '@/lib/settings';

export default function TeamSettingsScreen() {
  const { isSuperAdmin } = useAuth();
  const toast = useToast();

  const [teamName, setTeamName] = useState('');
  const [fee, setFee] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadSettings().then((s) => {
      setTeamName(s.teamName);
      setFee(String(s.monthlyFeeAmount));
      setRequireApproval(s.requireApproval);
    });
  }, []);

  const onSave = async () => {
    if (!teamName.trim()) {
      toast('팀명을 입력해 주세요.', 'error');
      return;
    }
    const amount = fee.replace(/[,\s]/g, '');
    if (!/^\d+$/.test(amount)) {
      toast('월 회비는 숫자만 입력해 주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveSetting('teamName', teamName.trim());
      await saveSetting('monthlyFeeAmount', Number(amount));
      await saveSetting('requireApproval', requireApproval);
      toast('설정을 저장했습니다.');
      router.back();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const parsedFee = Number(fee.replace(/[,\s]/g, ''));

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="팀 설정"
        subtitle="최고 관리자 전용"
        right={
          <Pressable
            accessibilityLabel="뒤로"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={20} color={Colors.textOnNavy} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!isSuperAdmin ? (
          <Card>
            <SectionTitle>권한이 없습니다</SectionTitle>
            <Muted>팀 설정은 최고 관리자만 변경할 수 있습니다.</Muted>
          </Card>
        ) : (
          <>
            <Card>
              <SectionTitle>기본</SectionTitle>
              <Field
                label="팀명"
                value={teamName}
                onChangeText={setTeamName}
                placeholder="FC Crossbar"
                hint="홈 화면 상단에 표시됩니다."
              />
              <Field
                label="월 회비"
                value={fee}
                onChangeText={setFee}
                keyboardType="number-pad"
                placeholder="30000"
                hint={
                  Number.isFinite(parsedFee) && parsedFee > 0
                    ? `${formatWon(parsedFee)} · 납부 화면의 기본 금액`
                    : '납부 화면의 기본 금액'
                }
              />
            </Card>

            <Card>
              <SectionTitle>가입</SectionTitle>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchLabel}>가입 승인제</Text>
                  <Muted>
                    켜면 신규 가입자가 &lsquo;승인 대기&rsquo; 상태로 만들어지고, 회원 관리에서
                    활성으로 바꿀 때까지 앱을 쓸 수 없습니다.
                  </Muted>
                </View>
                <Switch
                  value={requireApproval}
                  onValueChange={setRequireApproval}
                  trackColor={{ true: Colors.accent, false: Colors.border }}
                />
              </View>
              <Muted>이미 가입한 회원에게는 영향이 없습니다.</Muted>
            </Card>

            <AppButton label="저장" onPress={onSave} loading={saving} />
            <AppButton label="취소" variant="ghost" onPress={() => router.back()} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  switchText: { flex: 1, gap: 2 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
});
