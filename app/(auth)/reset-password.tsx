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
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [isLoading,   setIsLoading]   = useState(false);

  async function handleUpdate() {
    if (!password) {
      Alert.alert('入力エラー', '新しいパスワードを入力してください。');
      return;
    }
    if (password.length < 6) {
      Alert.alert('入力エラー', 'パスワードは6文字以上で設定してください。');
      return;
    }
    if (password !== confirm) {
      Alert.alert('入力エラー', 'パスワードが一致しません。');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (error) {
      Alert.alert('エラー', 'パスワードの変更に失敗しました。\nもう一度お試しください。');
      return;
    }

    Alert.alert(
      'パスワードを変更しました',
      'パスワードが正常に変更されました。',
      [{ text: 'OK', onPress: () => router.replace('/(tabs)') }],
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <Text style={styles.title}>新しいパスワードを設定</Text>
        <Text style={styles.subtitle}>
          新しいパスワードを入力してください。{'\n'}
          6文字以上で設定してください。
        </Text>

        <TextInput
          style={styles.input}
          placeholder="新しいパスワード"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          returnKeyType="next"
          autoFocus
        />
        <TextInput
          style={styles.input}
          placeholder="パスワードを確認"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={handleUpdate}
        />

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleUpdate}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '変更中...' : 'パスワードを変更する'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner:     { flex: 1, padding: 24, justifyContent: 'center' },

  title:    { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#6B7280', lineHeight: 21, marginBottom: 32 },

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
});
