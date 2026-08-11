import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/toast';
import { AppButton, Field } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { describeAuthError } from '@/lib/errors';
import { validateLoginId } from '@/lib/login-id';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    loginId: '',
    password: '',
    passwordConfirm: '',
    name: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    const loginIdProblem = validateLoginId(form.loginId);
    if (loginIdProblem) return loginIdProblem;
    if (form.password.length < 6) return '비밀번호는 6자 이상이어야 합니다.';
    if (form.password !== form.passwordConfirm) return '비밀번호가 일치하지 않습니다.';
    if (!form.name.trim()) return '이름을 입력해 주세요.';
    return null;
  };

  const onSubmit = async () => {
    const problem = validate();
    if (problem) {
      toast(problem, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { needsEmailConfirm } = await signUp(form);
      if (needsEmailConfirm) {
        // 아이디 로그인 방식에서는 실제 메일함이 없으므로 인증 메일을 받을 수 없다.
        // Supabase 의 Confirm email 설정이 켜져 있다는 뜻이라 관리자가 꺼 줘야 한다.
        toast('서버의 이메일 인증 설정이 켜져 있어 가입을 완료할 수 없습니다.', 'error');
        router.replace('/(auth)/sign-in');
      }
      // 정상 설정이면 바로 세션이 생기고 (auth)/_layout 이 홈으로 보낸다.
    } catch (e) {
      toast(describeAuthError(e), 'error');
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
              label="아이디"
              value={form.loginId}
              onChangeText={set('loginId')}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              placeholder="영문 소문자 · 숫자 3~20자"
              hint="로그인할 때 쓰는 아이디입니다. 나중에 바꿀 수 없습니다."
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
            <Field
              label="이름"
              value={form.name}
              onChangeText={set('name')}
              placeholder="홍길동"
              hint="실명으로 입력해 주세요. 팀 명부와 참석률에 이 이름이 표시됩니다."
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
