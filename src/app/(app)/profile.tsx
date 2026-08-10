import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { AppButton, Card, Field, SectionTitle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { describeDbError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const ROLE_LABEL: Record<string, string> = {
  super_admin: '최고 관리자',
  admin: '관리자',
  member: '일반 회원',
};

export default function ProfileScreen() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!profile) return;
    if (!name.trim()) {
      Alert.alert('입력 확인', '이름을 입력해 주세요.');
      return;
    }

    setSaving(true);
    // role / status 는 authenticated 롤에 UPDATE 권한 자체가 없다. (0001_schema.sql 참고)
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim(), nickname: nickname.trim() || null, phone: phone.trim() || null })
      .eq('id', profile.id);
    setSaving(false);

    if (error) {
      Alert.alert('저장 실패', describeDbError(error));
      return;
    }
    await refreshProfile();
    Alert.alert('저장 완료', '프로필이 수정되었습니다.');
  };

  const onSignOut = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="내 정보" subtitle={session?.user.email ?? undefined} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionTitle>프로필</SectionTitle>
          <Field label="이름" value={name} onChangeText={setName} />
          <Field label="닉네임 / 팀 내 호칭" value={nickname} onChangeText={setNickname} />
          <Field label="전화번호" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <AppButton label="저장" onPress={onSave} loading={saving} />
        </Card>

        <Card>
          <SectionTitle>계정</SectionTitle>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>권한</Text>
            <Text style={styles.rowValue}>{ROLE_LABEL[profile?.role ?? 'member']}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>상태</Text>
            <Text style={styles.rowValue}>{profile?.status ?? '-'}</Text>
          </View>
          <AppButton label="로그아웃" variant="outline" color={Colors.danger} onPress={onSignOut} />
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
