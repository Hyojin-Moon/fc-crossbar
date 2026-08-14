import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { AppButton, Card, Field, Muted, SectionTitle, Screen, ScreenScroll } from '@/components/ui';
import { Colors, Spacing, Typography, Weight } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { describeDbError } from '@/lib/errors';
import { formatWon } from '@/lib/finance';
import { loadSettings, saveSettings } from '@/lib/settings';

export default function TeamSettingsScreen() {
  const { isSuperAdmin } = useAuth();
  const toast = useToast();

  const [teamName, setTeamName] = useState('');
  const [fee, setFee] = useState('');
  const [annualFee, setAnnualFee] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadSettings().then((s) => {
      setTeamName(s.teamName);
      setFee(String(s.monthlyFeeAmount));
      setAnnualFee(String(s.annualFeeAmount));
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
    const annualAmount = annualFee.replace(/[,\s]/g, '');
    if (!/^\d+$/.test(annualAmount)) {
      toast('연납 회비는 숫자만 입력해 주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveSettings({
        teamName: teamName.trim(),
        monthlyFeeAmount: Number(amount),
        annualFeeAmount: Number(annualAmount),
        requireApproval,
      });
      toast('설정을 저장했습니다.');
      router.back();
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const parsedFee = Number(fee.replace(/[,\s]/g, ''));
  const parsedAnnual = Number(annualFee.replace(/[,\s]/g, ''));

  return (
    <Screen>
      <ScreenHeader title="팀 설정" subtitle="최고 관리자 전용" onBack={() => router.back()} />
      <ScreenScroll>
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
              <Field
                label="연납 회비"
                value={annualFee}
                onChangeText={setAnnualFee}
                keyboardType="number-pad"
                placeholder="300000"
                hint={
                  Number.isFinite(parsedAnnual) && parsedAnnual > 0
                    ? `${formatWon(parsedAnnual)} · 연초에 한 번에 낼 때의 할인 금액`
                    : '연초에 한 번에 낼 때의 할인 금액'
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
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  switchText: { flex: 1, gap: Spacing.half },
  switchLabel: { ...Typography.bodyLarge, fontWeight: Weight.semibold, color: Colors.text },
});
