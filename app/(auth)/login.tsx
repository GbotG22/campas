import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { COLORS } from '@/constants/theme';

// ── Supabase エラーメッセージを日本語に変換 ────────────────────
function toJapaneseLoginError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes('invalid login credentials') || m.includes('invalid email or password')) {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  if (m.includes('email not confirmed')) {
    return 'メールアドレスが確認されていません。確認メールをご確認ください。';
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'ログイン試行回数が多すぎます。\nしばらくしてからお試しください。';
  }
  if (m.includes('user not found') || m.includes('no user found')) {
    return 'このメールアドレスは登録されていません。';
  }
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to fetch')) {
    return 'ネットワークエラーが発生しました。\nインターネット接続をご確認ください。';
  }
  if (m.includes('account locked') || m.includes('blocked')) {
    return 'アカウントがロックされています。\nしばらくしてからお試しください。';
  }
  // 上記に該当しない場合は汎用メッセージ
  return 'ログインに失敗しました。\nもう一度お試しください。';
}

// ────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const { session } = useAuthStore();
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (session) return <Redirect href="/(tabs)" />;

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('入力エラー', 'メールアドレスとパスワードを入力してください。');
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsLoading(false);

    if (error) {
      Alert.alert('ログインエラー', toJapaneseLoginError(error.message));
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <Text style={styles.logo}>Camply</Text>
        <Text style={styles.subtitle}>学生のためのライフ管理アプリ</Text>

        <Text style={styles.label}>メールアドレス</Text>
        <TextInput
          style={styles.input}
          placeholder="example@email.com"
          placeholderTextColor={COLORS.gray400}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
        />
        <Text style={styles.label}>パスワード</Text>
        <TextInput
          style={styles.input}
          placeholder="パスワード"
          placeholderTextColor={COLORS.gray400}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </Text>
        </TouchableOpacity>

        {/* パスワードを忘れた場合 */}
        <TouchableOpacity
          style={styles.forgotBtn}
          onPress={() => router.push('/(auth)/forgot-password' as never)}
        >
          <Text style={styles.forgotText}>パスワードをお忘れですか？</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>アカウントをお持ちでない方は</Text>
          <Link href="/(auth)/register" style={styles.link}>
            新規登録
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  inner:     { flex: 1, padding: 24, justifyContent: 'center' },
  logo:      { fontSize: 36, fontWeight: '800', color: COLORS.primary, textAlign: 'center', marginBottom: 8 },
  subtitle:  { fontSize: 14, color: COLORS.gray500, textAlign: 'center', marginBottom: 40 },
  label:     { fontSize: 13, fontWeight: '700', color: COLORS.gray600, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: COLORS.gray50,
    color: COLORS.gray900,
  },
  button:         { backgroundColor: COLORS.primary, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  forgotBtn:  { alignItems: 'center', paddingVertical: 12 },
  forgotText: { color: COLORS.gray500, fontSize: 13, textDecorationLine: 'underline' },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 4 },
  footerText: { color: COLORS.gray500, fontSize: 14 },
  link:       { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
});
