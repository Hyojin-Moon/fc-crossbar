import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { AppButton, Card, Field, SectionTitle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
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
    // role / status 는 authenticated 롤에 UPDATE 권한 자체가 없다. (0001_schema.sql 참고)
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
    <View style={styles.screen}>
      <ScreenHeader title="내 정보" subtitle={loginId} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: Colors.textSecondary, fontSize: 14 },
  rowValue: { color: Colors.text, fontSize: 14, fontWeight: '600' },
});
