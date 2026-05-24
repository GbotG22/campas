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
import { Link, Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

export default function LoginScreen() {
  const { session } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (session) return <Redirect href="/(tabs)" />;

  async function handleLogin() {
    if (!email || !password) return;
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    if (error) Alert.alert('ログインエラー', error.message);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <Text style={styles.logo}>Campas</Text>
        <Text style={styles.subtitle}>学生のためのライフ管理アプリ</Text>

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
          placeholder="パスワード"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
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
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  logo: { fontSize: 36, fontWeight: '800', color: '#4F46E5', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 40 },
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
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 4 },
  footerText: { color: '#6B7280', fontSize: 14 },
  link: { color: '#4F46E5', fontSize: 14, fontWeight: '600' },
});
