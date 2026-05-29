import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, SPACING, RADIUS } from '@/constants/theme';

// ─────────────────────────────────────────────────────────────
// プライバシーポリシーページ
// ─────────────────────────────────────────────────────────────
export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── ヘッダー ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>プライバシーポリシー</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        <Text style={styles.updated}>最終更新日：2025年5月27日</Text>

        <Section title="1. 収集する情報">
          {`本アプリが収集・保存する情報は以下のとおりです。\n\n・メールアドレス（アカウント作成時）\n・時間割・授業情報\n・予定・課題・イベント\n・バイトシフト・収支情報\n・出席記録`}
        </Section>

        <Section title="2. 情報の利用目的">
          {`収集した情報は以下の目的で利用します。\n\n・本アプリのサービス提供・機能の動作\n・ユーザー認証とデータの同期\n・プッシュ通知（締切・シフトのリマインダー）\n・アプリの改善・デバッグ`}
        </Section>

        <Section title="3. 情報の保管">
          {`ユーザーデータはSupabase（データベースサービス）のサーバーに暗号化して保存されます。Supabaseのセキュリティ基準（SOC 2 Type 2）に準拠しています。`}
        </Section>

        <Section title="4. 第三者への提供">
          {`以下の場合を除き、収集した情報を第三者に提供することはありません。\n\n・法令に基づく開示要求がある場合\n・サービス提供に必要な外部サービス（Supabase、RevenueCat）との連携`}
        </Section>

        <Section title="5. 利用する外部サービス">
          {`本アプリは以下の外部サービスを利用しています。\n\n・Supabase（データベース・認証）\n  https://supabase.com/privacy\n\n・RevenueCat（課金管理）\n  https://www.revenuecat.com/privacy\n\n・Anthropic Claude（AIアドバイス機能、任意設定）\n  https://www.anthropic.com/privacy`}
        </Section>

        <Section title="6. プッシュ通知">
          {`本アプリはプッシュ通知を送信することがあります。通知はデバイス内でのみ処理されます（ローカル通知）。通知の設定はOSの設定アプリから変更できます。`}
        </Section>

        <Section title="7. データの削除">
          {`アカウントを削除すると、関連するデータはすべて削除されます。削除のご要望は設定画面のメールアドレスまでご連絡ください。`}
        </Section>

        <Section title="8. 未成年者">
          {`本アプリは13歳以上を対象としています。13歳未満のお子様の個人情報を意図的に収集することはありません。`}
        </Section>

        <Section title="9. ポリシーの変更">
          {`本ポリシーは予告なく変更されることがあります。変更後も継続してご利用いただいた場合、変更に同意したものとみなします。`}
        </Section>

        <Section title="10. お問い合わせ">
          {`プライバシーに関するご質問・ご要望は以下までご連絡ください。\n\nメール：Kazukioikawa14@icloud.com`}
        </Section>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── セクション共通コンポーネント ─────────────────────────────
function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },

  // ヘッダー
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.gray900 },

  // コンテンツ
  scroll:   { flex: 1 },
  content:  { padding: SPACING.md },
  updated:  { fontSize: 12, color: COLORS.gray400, marginBottom: SPACING.lg },

  // セクション
  section: {
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.gray50,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: SPACING.sm,
  },
  sectionBody: {
    fontSize: 14,
    color: COLORS.gray600,
    lineHeight: 22,
  },
});
