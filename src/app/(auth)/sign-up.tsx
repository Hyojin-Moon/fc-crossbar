import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, Field } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { describeAuthError } from '@/lib/errors';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    name: '',
    nickname: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    if (!form.email.trim()) return '이메일을 입력해 주세요.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return '이메일 형식이 올바르지 않습니다.';
    if (form.password.length < 6) return '비밀번호는 6자 이상이어야 합니다.';
    if (form.password !== form.passwordConfirm) return '비밀번호가 일치하지 않습니다.';
    if (!form.name.trim()) return '이름을 입력해 주세요.';
    return null;
  };

  const onSubmit = async () => {
    const problem = validate();
    if (problem) {
      Alert.alert('입력 확인', problem);
      return;
    }

    setSubmitting(true);
    try {
      const { needsEmailConfirm } = await signUp(form);
      if (needsEmailConfirm) {
        Alert.alert(
          '가입 신청 완료',
          '입력한 이메일로 인증 메일을 보냈습니다. 인증 후 로그인해 주세요.',
          [{ text: '확인', onPress: () => router.replace('/(auth)/sign-in') }]
        );
      }
      // 이메일 인증이 꺼져 있으면 바로 세션이 생기고 (auth)/_layout 이 홈으로 보낸다.
    } catch (e) {
      Alert.alert('가입 실패', describeAuthError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>회원가입</Text>

          <View style={styles.form}>
            <Field
              label="이메일"
              value={form.email}
              onChangeText={set('email')}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Field
              label="비밀번호"
              value={form.password}
              onChangeText={set('password')}
              secureTextEntry
              autoCapitalize="none"
              placeholder="6자 이상"
            />
            <Field
              label="비밀번호 확인"
              value={form.passwordConfirm}
              onChangeText={set('passwordConfirm')}
              secureTextEntry
              autoCapitalize="none"
            />
            <Field label="이름" value={form.name} onChangeText={set('name')} placeholder="홍길동" />
            <Field
              label="닉네임 / 팀 내 호칭"
              value={form.nickname}
              onChangeText={set('nickname')}
              placeholder="선택"
            />
            <Field
              label="전화번호"
              value={form.phone}
              onChangeText={set('phone')}
              keyboardType="phone-pad"
              placeholder="선택"
            />
            <AppButton label="가입하기" onPress={onSubmit} loading={submitting} />
            <AppButton label="뒤로" variant="ghost" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.four },
  title: { fontSize: 26, fontWeight: '800', color: Colors.navy, textAlign: 'center' },
  form: { gap: Spacing.three },
});
