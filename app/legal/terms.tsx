import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, SPACING, RADIUS } from '@/constants/theme';

// ─────────────────────────────────────────────────────────────
// 利用規約ページ
// ─────────────────────────────────────────────────────────────
export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── ヘッダー ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>利用規約</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        <Text style={styles.updated}>最終更新日：2026年6月17日</Text>

        <Section title="第1条（本規約の適用）">
          本利用規約（以下「本規約」）は、Camply（以下「本アプリ」）の利用条件を定めるものです。ユーザーは本規約に同意したうえで本アプリをご利用ください。
        </Section>

        <Section title="第2条（サービス内容）">
          本アプリは、大学生向けの学習・生活管理アプリです。時間割管理、課題管理、収支管理、バイトシフト管理、カレンダー連携などの機能を提供します。
        </Section>

        <Section title="第3条（アカウント）">
          {`ユーザーはメールアドレスとパスワードでアカウントを作成できます。アカウント情報は適切に管理してください。不正利用が発覚した場合、アカウントを停止することがあります。`}
        </Section>

        <Section title="第4条（外部サービス連携）">
          本アプリは、Googleカレンダーなどの外部サービスと連携する機能を提供することがあります。外部サービスの利用には、各サービスの規約およびポリシーが適用されます。
        </Section>

        <Section title="第5条（課金・サブスクリプション）">
          {`一部の機能はサブスクリプション（有料プラン）での提供となります。料金・更新条件はApp Store / Google Playの表示に従います。\n\n無料トライアル期間中にキャンセルされない場合、有料プランへ自動移行します。解約はいつでも可能です。`}
        </Section>

        <Section title="第6条（禁止事項）">
          {`以下の行為を禁止します。\n・本アプリの不正利用、改ざん、リバースエンジニアリング\n・他のユーザーへの迷惑行為\n・法令に違反する行為\n・その他、当方が不適切と判断する行為`}
        </Section>

        <Section title="第7条（免責事項）">
          {`本アプリの利用によって生じた損害について、当方は一切の責任を負いません。本アプリは「現状有姿」で提供されます。サービスの中断・終了によって生じた損害も同様です。`}
        </Section>

        <Section title="第8条（サービスの変更・終了）">
          当方は予告なくサービス内容の変更・機能の追加・削除・サービスの終了を行うことができます。
        </Section>

        <Section title="第9条（規約の変更）">
          当方は必要に応じて本規約を変更できます。変更後も継続して本アプリを利用された場合、変更後の規約に同意したものとみなします。
        </Section>

        <Section title="第10条（準拠法・管轄）">
          本規約は日本法に準拠します。本アプリに関する紛争は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
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
