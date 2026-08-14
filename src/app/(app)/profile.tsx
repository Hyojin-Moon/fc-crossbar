import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { AppButton, Card, Field, SectionTitle, Screen, ScreenScroll } from '@/components/ui';
import { Colors, Typography, Weight } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { confirmAsync } from '@/lib/confirm';
import { describeDbError } from '@/lib/errors';
import { emailToLoginId } from '@/lib/login-id';
import { supabase } from '@/lib/supabase';

const ROLE_LABEL: Record<string, string> = {
  super_admin: '최고 관리자',
  admin: '관리자',
  member: '일반 회원',
};

export default function ProfileScreen() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);

  const loginId = profile?.login_id ?? emailToLoginId(session?.user.email);

  const onSave = async () => {
    if (!profile) return;
    if (!name.trim()) {
      toast('이름을 입력해 주세요.', 'error');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim(), phone: phone.trim() || null })
      .eq('id', profile.id);
    setSaving(false);

    if (error) {
      toast(describeDbError(error), 'error');
      return;
    }
    await refreshProfile();
    toast('프로필이 수정되었습니다.');
  };

  const onSignOut = async () => {
    const ok = await confirmAsync({
      title: '로그아웃',
      message: '로그아웃 하시겠습니까?',
      confirmLabel: '로그아웃',
      destructive: true,
    });
    if (!ok) return;
    try {
      await signOut();
    } catch (e) {
      toast(describeDbError(e), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader title="내 정보" subtitle={loginId} />
      <ScreenScroll>
        <Card>
          <SectionTitle>프로필</SectionTitle>
          <Field label="이름" value={name} onChangeText={setName} hint="실명으로 입력해 주세요." />
          <Field label="전화번호" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <AppButton label="저장" onPress={onSave} loading={saving} />
        </Card>

        <Card>
          <SectionTitle>계정</SectionTitle>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>아이디</Text>
            <Text style={styles.rowValue}>{loginId}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>권한</Text>
            <Text style={styles.rowValue}>{ROLE_LABEL[profile?.role ?? 'member']}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>상태</Text>
            <Text style={styles.rowValue}>{profile?.status ?? '-'}</Text>
          </View>
          <AppButton
            label="로그아웃"
            variant="outline"
            color={Colors.danger}
            onPress={() => void onSignOut()}
          />
        </Card>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: Colors.textSecondary, ...Typography.body },
  rowValue: { color: Colors.text, ...Typography.body, fontWeight: Weight.semibold },
});
