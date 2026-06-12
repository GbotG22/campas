import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { COLORS, RADIUS, SPACING } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,     setError]    = useState('');
  const [done,      setDone]     = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleUpdate() {
    // ── バリデーション（インラインで表示） ──
    if (!password || !confirm) {
      setError('新しいパスワードを2回入力してください。');
      return;
    }
    if (password.length < 8) {
      setError('パスワードは8文字以上で設定してください。');
      return;
    }
    if (password !== confirm) {
      setError('2つのパスワードが一致しません。');
      return;
    }
    setError('');

    setIsLoading(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (updErr) {
      setError('パスワードの変更に失敗しました。もう一度お試しください。');
      return;
    }

    // 成功 → 完了ビューを表示してからホームへ
    setDone(true);
  }

  // ── 変更完了ビュー ────────────────────────────────────────
  if (done) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.inner}>
          <View style={styles.doneIconWrap}>
            <Text style={styles.doneIcon}>✅</Text>
          </View>
          <Text style={styles.doneTitle}>パスワードを変更しました</Text>
          <Text style={styles.doneBody}>
            新しいパスワードで利用を続けられます。
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.buttonText}>ホームへ戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── 入力フォーム ──────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <Text style={styles.title}>パスワードを再設定</Text>
        <Text style={styles.subtitle}>
          新しいパスワードを2回入力してください。{'\n'}
          8文字以上で設定してください。
        </Text>

        <Text style={styles.label}>新しいパスワード</Text>
        <TextInput
          style={styles.input}
          placeholder="8文字以上"
          placeholderTextColor={COLORS.gray400}
          value={password}
          onChangeText={(t) => { setPassword(t); if (error) setError(''); }}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          returnKeyType="next"
          autoFocus
        />

        <Text style={styles.label}>新しいパスワード（確認）</Text>
        <TextInput
          style={styles.input}
          placeholder="もう一度入力"
          placeholderTextColor={COLORS.gray400}
          value={confirm}
          onChangeText={(t) => { setConfirm(t); if (error) setError(''); }}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={handleUpdate}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleUpdate}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '変更中...' : 'パスワードを変更'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  inner:     { flex: 1, padding: SPACING.lg, justifyContent: 'center' },

  title:    { fontSize: 24, fontWeight: '800', color: COLORS.gray900, marginBottom: 10 },
  subtitle: { fontSize: 14, color: COLORS.gray500, lineHeight: 21, marginBottom: 28 },

  label: { fontSize: 13, fontWeight: '700', color: COLORS.gray600, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: RADIUS.md,
    padding: 14,
    fontSize: 16,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.gray50,
    color: COLORS.gray900,
  },

  errorText: {
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '600',
    marginTop: -4,
    marginBottom: SPACING.md,
  },

  button:         { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: 16, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: COLORS.white, fontWeight: '700', fontSize: 16 },

  // 完了ビュー
  doneIconWrap: { alignItems: 'center', marginBottom: 20 },
  doneIcon:     { fontSize: 56 },
  doneTitle:    { fontSize: 22, fontWeight: '800', color: COLORS.gray900, textAlign: 'center', marginBottom: 12 },
  doneBody:     { fontSize: 14, color: COLORS.gray500, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
});
