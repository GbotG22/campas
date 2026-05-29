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
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

export default function RegisterScreen() {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleRegister() {
    // ── 入力チェック ──────────────────────────────────────
    if (!email.trim() || !password) {
      Alert.alert('入力エラー', 'メールアドレスとパスワードを入力してください');
      return;
    }
    if (password.length < 8) {
      Alert.alert('入力エラー', 'パスワードは8文字以上で設定してください');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setIsLoading(false);

    if (error) {
      // エラーメッセージを日本語で表示
      let message = error.message;
      if (message.includes('already registered') || message.includes('already been registered')) {
        message = 'このメールアドレスはすでに登録されています。\nログイン画面からサインインしてください。';
      } else if (message.includes('invalid')) {
        message = 'メールアドレスの形式が正しくありません。';
      } else if (message.includes('password')) {
        message = 'パスワードが短すぎます。8文字以上で設定してください。';
      }
      Alert.alert('登録エラー', message);
      return;
    }

    // Confirm email が OFF の場合、登録と同時にセッションが作られる。
    // onAuthStateChange → setSession → _layout.tsx が自動でホームへ遷移する。
    // ここでは何もしなくてよい（自動遷移に任せる）。
    Alert.alert('🎉 登録完了', 'Campasへようこそ！\nホーム画面に移動します。');
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        {/* ── ロゴ ── */}
        <Text style={styles.logo}>Campas</Text>
        <Text style={styles.title}>アカウント作成</Text>
        <Text style={styles.subtitle}>学生生活をもっとスマートに管理しよう</Text>

        {/* ── フォーム ── */}
        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード（8文字以上）"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />

        {/* パスワード強度インジケーター */}
        {password.length > 0 && (
          <View style={styles.strengthRow}>
            <View style={[
              styles.strengthBar,
              { backgroundColor: password.length >= 8 ? '#10B981' : '#F59E0B' },
            ]} />
            <Text style={[
              styles.strengthText,
              { color: password.length >= 8 ? '#10B981' : '#F59E0B' },
            ]}>
              {password.length < 8
                ? `あと${8 - password.length}文字`
                : 'OK'}
            </Text>
          </View>
        )}

        {/* ── 登録ボタン ── */}
        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '登録中...' : '無料で始める'}
          </Text>
        </TouchableOpacity>

        {/* ── ログインへのリンク ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>すでにアカウントをお持ちの方は</Text>
          <Link href="/(auth)/login" style={styles.link}>ログイン</Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner:     { flex: 1, padding: 24, justifyContent: 'center' },

  logo:     { fontSize: 32, fontWeight: '800', color: '#4F46E5', textAlign: 'center', marginBottom: 4 },
  title:    { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 36 },

  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
  },

  // パスワード強度
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginTop: -4,
  },
  strengthBar:  { flex: 1, height: 4, borderRadius: 2 },
  strengthText: { fontSize: 12, fontWeight: '600', width: 56, textAlign: 'right' },

  button:         { backgroundColor: '#4F46E5', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: '#fff', fontWeight: '700', fontSize: 16 },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 4 },
  footerText: { color: '#6B7280', fontSize: 14 },
  link:       { color: '#4F46E5', fontSize: 14, fontWeight: '600' },
});
