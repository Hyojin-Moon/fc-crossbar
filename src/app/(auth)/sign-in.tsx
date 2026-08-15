import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Image,
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
import { Colors, Spacing, Typography, Weight } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { describeAuthError } from '@/lib/errors';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const toast = useToast();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!loginId.trim() || !password) {
      toast('아이디와 비밀번호를 입력해 주세요.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(loginId, password);
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
          <View style={styles.header}>
            <Image
              source={require('@/assets/images/logo-black.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View style={styles.form}>
            <Field
              label="아이디"
              value={loginId}
              onChangeText={setLoginId}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              placeholder="아이디"
            />
            <Field
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              placeholder="••••••••"
              onSubmitEditing={onSubmit}
              returnKeyType="go"
            />
            <AppButton label="로그인" onPress={onSubmit} loading={submitting} />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>아직 계정이 없나요?</Text>
            <Link href="/(auth)/sign-up" style={styles.link}>
              회원가입
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.five },
  header: { alignItems: 'center', gap: Spacing.two },
  logo: { width: 160, height: 176 },
  tagline: { ...Typography.body, color: Colors.textSecondary },
  form: { gap: Spacing.three },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  footerText: { color: Colors.textSecondary },
  link: { color: Colors.navy, fontWeight: Weight.bold },
});
