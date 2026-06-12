import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import Constants from 'expo-constants';

import { COLORS, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

// ─────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────
type Category = '不具合報告' | '改善要望' | '新機能の提案' | 'その他';

const CATEGORIES: { value: Category; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { value: '不具合報告',   icon: 'bug-outline',          color: '#DC2626' },
  { value: '改善要望',     icon: 'build-outline',        color: '#D97706' },
  { value: '新機能の提案', icon: 'bulb-outline',         color: '#7C3AED' },
  { value: 'その他',       icon: 'chatbubble-outline',   color: COLORS.gray500 },
];

const APP_VERSION: string =
  (Constants.expoConfig?.version as string | undefined) ?? '1.0.0';

// ─────────────────────────────────────────────────────────────
// フィードバック画面
// ─────────────────────────────────────────────────────────────
export default function FeedbackScreen() {
  const { user } = useAuthStore();

  const [category, setCategory] = useState<Category>('不具合報告');
  const [message,  setMessage]  = useState('');
  const [sending,  setSending]  = useState(false);
  const [done,     setDone]     = useState(false);

  async function handleSend() {
    if (!message.trim()) {
      Alert.alert('入力エラー', '内容を入力してください。');
      return;
    }
    if (!user) return;

    setSending(true);
    const { error } = await supabase.from('feedback').insert({
      user_id:     user.id,
      category,
      message:     message.trim(),
      app_version: APP_VERSION,
    });
    setSending(false);

    if (error) {
      Alert.alert('送信エラー', '送信に失敗しました。しばらくしてから再試行してください。');
    } else {
      setDone(true);
    }
  }

  // ── 送信完了ビュー ─────────────────────────────────────────
  if (done) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <View style={styles.doneContainer}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={40} color={COLORS.white} />
          </View>
          <Text style={styles.doneTitle}>送信完了</Text>
          <Text style={styles.doneBody}>
            フィードバックを送信しました。{'\n'}ご協力ありがとうございます。
          </Text>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.doneBtnText}>設定に戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── 入力フォーム ───────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 説明文 */}
        <View style={styles.descCard}>
          <Text style={styles.descText}>
            Camplyをより良いアプリにするため、ご意見や不具合報告をお送りください。{'\n'}
            いただいた内容は今後の改善に活用させていただきます。
          </Text>
        </View>

        {/* カテゴリ */}
        <Text style={styles.fieldLabel}>カテゴリ</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map(cat => {
            const active = category === cat.value;
            return (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.categoryChip,
                  active && { borderColor: cat.color, backgroundColor: cat.color + '12' },
                ]}
                onPress={() => setCategory(cat.value)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={cat.icon}
                  size={18}
                  color={active ? cat.color : COLORS.gray400}
                />
                <Text style={[styles.categoryChipText, active && { color: cat.color, fontWeight: '700' }]}>
                  {cat.value}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 内容 */}
        <Text style={styles.fieldLabel}>
          内容 <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.messageInput}
          value={message}
          onChangeText={setMessage}
          placeholder="お気づきの点や改善してほしい内容を入力してください"
          placeholderTextColor={COLORS.gray400}
          multiline
          textAlignVertical="top"
          maxLength={2000}
        />
        <Text style={styles.charCount}>{message.length} / 2000</Text>

        {/* 送信ボタン */}
        <TouchableOpacity
          style={[styles.sendBtn, (sending || !message.trim()) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={sending || !message.trim()}
          activeOpacity={0.8}
        >
          {sending ? (
            <Text style={styles.sendBtnText}>送信中...</Text>
          ) : (
            <>
              <Ionicons name="send-outline" size={18} color={COLORS.white} />
              <Text style={styles.sendBtnText}>送信する</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// ヘッダー（戻るボタン付き）
// ─────────────────────────────────────────────────────────────
function Header() {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={24} color={COLORS.gray700} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>ご意見・不具合報告</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// スタイル
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.gray50 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.gray900,
  },

  // ── 説明文 ────────────────────────────────────────────────
  descCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOW.sm,
  },
  descText: {
    fontSize: 14,
    color: COLORS.gray600,
    lineHeight: 22,
  },

  // ── フィールドラベル ──────────────────────────────────────
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gray600,
    marginBottom: SPACING.xs + 2,
    marginLeft: 2,
  },
  required: {
    color: COLORS.danger,
  },

  // ── カテゴリグリッド ──────────────────────────────────────
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs + 2,
    marginBottom: SPACING.lg,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm + 4,
    paddingVertical: SPACING.xs + 4,
    borderRadius: RADIUS.full ?? 999,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  categoryChipText: {
    fontSize: 14,
    color: COLORS.gray500,
  },

  // ── テキストエリア ────────────────────────────────────────
  messageInput: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    padding: SPACING.md,
    fontSize: 15,
    color: COLORS.gray900,
    minHeight: 160,
    lineHeight: 22,
    ...SHADOW.sm,
  },
  charCount: {
    fontSize: 12,
    color: COLORS.gray400,
    textAlign: 'right',
    marginTop: 6,
    marginBottom: SPACING.lg,
    marginRight: 2,
  },

  // ── 送信ボタン ────────────────────────────────────────────
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs + 2,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },

  // ── 送信完了 ──────────────────────────────────────────────
  doneContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  doneTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.gray900,
  },
  doneBody: {
    fontSize: 15,
    color: COLORS.gray500,
    textAlign: 'center',
    lineHeight: 24,
  },
  doneBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});
