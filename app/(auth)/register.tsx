import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleRegister() {
    if (!email || !password) return;
    setIsLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setIsLoading(false);
    if (error) {
      Alert.alert('登録エラー', error.message);
    } else {
      Alert.alert('確認メールを送信しました', 'メールを確認してアカウントを有効化してください。', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <Text style={styles.title}>アカウント作成</Text>
        <Text style={styles.subtitle}>14日間無料で全機能お試しいただけます</Text>

        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード（8文字以上）"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '登録中...' : '無料で始める'}
          </Text>
        </TouchableOpacity>

        <Link href="/(auth)/login" style={styles.link}>
          すでにアカウントをお持ちの方はこちら
        </Link>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 40 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
  },
  button: {
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: '#4F46E5', fontSize: 14, textAlign: 'center', marginTop: 24 },
});
