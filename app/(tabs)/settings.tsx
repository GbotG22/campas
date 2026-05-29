import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { COLORS, SPACING, RADIUS, SHADOW } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';
import { usePremium } from '@/hooks/usePremium';

// ─────────────────────────────────────────────────────────────
// 設定画面
// ─────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { user, signOut, deleteAccount } = useAuthStore();
  const { isPremium, isAiPlus, isLoading: planLoading } = usePremium();

  // ── ログアウト確認アラート ────────────────────────────────
  function handleLogout() {
    Alert.alert(
      'ログアウト',
      'ログアウトしますか？\nデータはサーバーに保存されています。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'ログアウト',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            // セッションが null になると _layout.tsx が自動でログイン画面へ遷移する
          },
        },
      ],
    );
  }

  // ── アカウント削除（2段階確認） ──────────────────────────
  function handleDeleteAccount() {
    // 1段階目：削除の意図を確認
    Alert.alert(
      'アカウントを削除',
      'アカウントを削除すると、時間割・予定・収支など\nすべてのデータが完全に消去されます。\n\nこの操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除を続ける',
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ],
    );
  }

  function confirmDeleteAccount() {
    // 2段階目：最終確認
    Alert.alert(
      '本当に削除しますか？',
      '「削除する」を押すと、アカウントとすべてのデータが\n即座に削除されます。',
      [
        { text: 'やめる', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: executeDeleteAccount,
        },
      ],
    );
  }

  async function executeDeleteAccount() {
    try {
      await deleteAccount();
      // deleteAccount() 内で signOut → setSession(null) → _layout.tsx がログイン画面へ自動遷移
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '不明なエラー';

      // DB 関数が未実行の場合のヒント
      const hint = msg.includes('Could not find the function') || msg.includes('does not exist')
        ? '\n\n📌 設定手順：\nSupabase Dashboard → SQL Editor で\n「007_delete_user_function.sql」を実行してください。'
        : '';

      Alert.alert('削除に失敗しました', `${msg}${hint}`);
    }
  }

  // ── メールアドレスの先頭文字（アバター用）───────────────
  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? '?';

  // ── 登録日のフォーマット ─────────────────────────────────
  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : '不明';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── ヘッダー ── */}
      <View style={styles.header}>
        <Text style={styles.title}>設定</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* ── ユーザー情報カード ── */}
        <View style={styles.userCard}>
          {/* アバター（メールの頭文字） */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userEmail} numberOfLines={1}>
              {user?.email ?? '不明'}
            </Text>
            <Text style={styles.userSince}>登録日：{joinedDate}</Text>
          </View>
        </View>

        {/* ── セクション：プラン ── */}
        <SectionLabel label="プラン" />
        <View style={styles.menuCard}>
          <PlanRow
            icon="star"
            label="Premium"
            sublabel="Googleカレンダー連携"
            isActive={isPremium}
            isLoading={planLoading}
            accentColor={COLORS.primary}
            onUpgrade={() => router.push('/paywall/premium' as never)}
          />
          <PlanRow
            icon="flash"
            label="AI Plus"
            sublabel="AI分析・アドバイス"
            isActive={isAiPlus}
            isLoading={planLoading}
            accentColor="#7C3AED"
            onUpgrade={() => router.push('/paywall/ai_plus' as never)}
            isLast
          />
        </View>

        {/* ── セクション：アカウント ── */}
        <SectionLabel label="アカウント" />
        <View style={styles.menuCard}>
          <SettingsRow
            icon="mail-outline"
            label="メールアドレス"
            value={user?.email ?? '不明'}
          />
        </View>

        {/* ── セクション：アプリ情報 ── */}
        <SectionLabel label="アプリ情報" />
        <View style={styles.menuCard}>
          <SettingsRow
            icon="phone-portrait-outline"
            label="アプリバージョン"
            value="1.0.0"
          />
          <SettingsRow
            icon="server-outline"
            label="データ保存"
            value="Supabase（クラウド）"
            isLast
          />
        </View>

        {/* ── セクション：法的情報 ── */}
        <SectionLabel label="法的情報" />
        <View style={styles.menuCard}>
          <SettingsRow
            icon="document-text-outline"
            label="利用規約"
            onPress={() => router.push('/legal/terms' as never)}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="プライバシーポリシー"
            onPress={() => router.push('/legal/privacy' as never)}
            isLast
          />
        </View>

        {/* ── ログアウトボタン ── */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={styles.logoutText}>ログアウト</Text>
        </TouchableOpacity>

        {/* ── アカウント削除ボタン ── */}
        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={handleDeleteAccount}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={16} color={COLORS.gray400} />
          <Text style={styles.deleteAccountText}>アカウントを削除する</Text>
        </TouchableOpacity>

        {/* 余白 */}
        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// セクションラベル
// ─────────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

// ─────────────────────────────────────────────────────────────
// プラン状態行（Premium / AI Plus）
// ─────────────────────────────────────────────────────────────
function PlanRow({
  icon, label, sublabel,
  isActive, isLoading, accentColor,
  onUpgrade, isLast = false,
}: {
  icon:        'star' | 'flash';
  label:       string;
  sublabel:    string;
  isActive:    boolean;
  isLoading:   boolean;
  accentColor: string;
  onUpgrade:   () => void;
  isLast?:     boolean;
}) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      {/* アイコン */}
      <Ionicons
        name={isActive ? icon : `${icon}-outline` as never}
        size={20}
        color={isActive ? accentColor : COLORS.gray400}
      />

      {/* ラベル */}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { marginBottom: 0 }]}>{label}</Text>
        <Text style={styles.planSublabel}>{sublabel}</Text>
      </View>

      {/* 状態バッジ or アップグレードリンク */}
      {isLoading ? (
        <Text style={styles.planLoadingText}>確認中</Text>
      ) : isActive ? (
        <View style={[styles.planActiveBadge, { backgroundColor: accentColor + '18' }]}>
          <Text style={[styles.planActiveBadgeText, { color: accentColor }]}>✓ 有効</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.planUpgradeBtn}
          onPress={onUpgrade}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.planUpgradeBtnText}>詳細を見る</Text>
          <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 設定行（アイコン + ラベル + 値）
// ─────────────────────────────────────────────────────────────
function SettingsRow({
  icon, label, value, onPress, isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  isLast?: boolean;
}) {
  const inner = (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Ionicons name={icon} size={20} color={COLORS.gray400} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      {onPress && (
        <Ionicons name="chevron-forward" size={16} color={COLORS.gray300} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

// ─────────────────────────────────────────────────────────────
// スタイル
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.gray50 },
  scrollContent: { paddingBottom: SPACING.xl },

  // ── ヘッダー ──────────────────────────────────────────────
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.gray900,
    letterSpacing: -0.5,
  },

  // ── ユーザーカード ────────────────────────────────────────
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOW.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.white,
  },
  userInfo:  { flex: 1 },
  userEmail: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.gray900,
  },
  userSince: {
    fontSize: 12,
    color: COLORS.gray400,
    marginTop: 3,
  },

  // ── セクションラベル ──────────────────────────────────────
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray400,
    paddingHorizontal: SPACING.md + 4,
    marginBottom: SPACING.xs + 2,
    marginTop: SPACING.xs,
    letterSpacing: 0.5,
  },

  // ── メニューカード ────────────────────────────────────────
  menuCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  // 最後の行は下ボーダーなし
  rowLast: { borderBottomWidth: 0 },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.gray900,
  },
  rowValue: {
    fontSize: 13,
    color: COLORS.gray400,
    maxWidth: 180,
    textAlign: 'right',
  },

  // ── ログアウトボタン ──────────────────────────────────────
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.dangerLight,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.danger,
  },

  // ── プラン行 ──────────────────────────────────────────────
  planSublabel: {
    fontSize: 11,
    color: COLORS.gray400,
    marginTop: 2,
  },
  planActiveBadge: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planActiveBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  planUpgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  planUpgradeBtnText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  planLoadingText: {
    fontSize: 12,
    color: COLORS.gray400,
  },

  // ── アカウント削除ボタン（目立たせすぎない）────────────────
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs + 2,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 4,
  },
  deleteAccountText: {
    fontSize: 13,
    color: COLORS.gray400,
    textDecorationLine: 'underline',
  },
});
