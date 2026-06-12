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
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

// ── Supabase エラーメッセージを日本語に変換 ────────────────────
function toJapaneseResetError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('user not found') || m.includes('no user found')) {
    return 'このメールアドレスは登録されていません。';
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'リクエストが多すぎます。\nしばらくしてからお試しください。';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'ネットワークエラーが発生しました。\nインターネット接続をご確認ください。';
  }
  return 'メールの送信に失敗しました。\nもう一度お試しください。';
}

// ────────────────────────────────────────────────────────────
export default function ForgotPasswordScreen() {
  const [email,     setEmail]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent,      setSent]      = useState(false);

  async function handleSend() {
    if (!email.trim()) {
      Alert.alert('入力エラー', 'メールアドレスを入力してください。');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'camply://reset-password',
    });
    setIsLoading(false);

    if (error) {
      Alert.alert('送信エラー', toJapaneseResetError(error.message));
      return;
    }

    // 送信成功 → 完了ビューに切り替え
    setSent(true);
  }

  // ── 送信完了ビュー ────────────────────────────────────────
  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.inner}>

          <View style={styles.sentIconWrap}>
            <Text style={styles.sentIcon}>📬</Text>
          </View>

          <Text style={styles.sentTitle}>メールを送信しました</Text>
          <Text style={styles.sentBody}>
            <Text style={styles.sentEmail}>{email.trim()}</Text>
            {'\n\n'}
            にパスワードリセット用のリンクを送信しました。{'\n'}
            メールをご確認のうえ、リンクからパスワードを変更してください。
          </Text>

          <Text style={styles.sentNote}>
            ※ メールが届かない場合は迷惑メールフォルダもご確認ください。
          </Text>

          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>ログイン画面に戻る</Text>
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

        {/* 戻るボタン */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backText}>← ログインに戻る</Text>
        </TouchableOpacity>

        <Text style={styles.title}>パスワードの再設定</Text>
        <Text style={styles.subtitle}>
          登録したメールアドレスを入力してください。{'\n'}
          パスワードリセット用のリンクをお送りします。
        </Text>

        <Text style={styles.label}>メールアドレス</Text>
        <TextInput
          style={styles.input}
          placeholder="example@email.com"
          placeholderTextColor="#9CA3AF"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={handleSend}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '送信中...' : 'リセットメールを送信'}
          </Text>
        </TouchableOpacity>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner:     { flex: 1, padding: 24, justifyContent: 'center' },

  backBtn:  { position: 'absolute', top: 16, left: 0 },
  backText: { color: '#4F46E5', fontSize: 15, fontWeight: '600' },

  title:    { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#6B7280', lineHeight: 21, marginBottom: 32 },
  label:    { fontSize: 13, fontWeight: '700', color: '#4B5563', marginBottom: 6 },

  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#F9FAFB',
    color: '#111827',
  },

  button:         { backgroundColor: '#4F46E5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: '#fff', fontWeight: '700', fontSize: 16 },

  // 送信完了ビュー
  sentIconWrap: { alignItems: 'center', marginBottom: 20 },
  sentIcon:     { fontSize: 56 },
  sentTitle:    { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 16 },
  sentBody:     { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  sentEmail:    { fontWeight: '700', color: '#111827' },
  sentNote:     { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginBottom: 32, lineHeight: 18 },
});
