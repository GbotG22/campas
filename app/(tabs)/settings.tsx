import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, SPACING, RADIUS, SHADOW } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';
import { useProfileStore } from '@/stores/profile.store';
import { usePremium } from '@/hooks/usePremium';
import { IS_REVENUECAT_CONFIGURED } from '@/lib/revenuecat';
import { supabase } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────
// 設定画面
// ─────────────────────────────────────────────────────────────
const DEV_PREMIUM_KEY  = 'campas_dev_premium';
const DEV_AI_PLUS_KEY  = 'campas_dev_ai_plus';

export default function SettingsScreen() {
  const { user, signOut, deleteAccount, refreshUser } = useAuthStore();
  const { displayName, update: updateProfile } = useProfileStore();
  const { isPremium, isAiPlus, isLoading: planLoading, refresh } = usePremium();

  // ── 表示名編集 ─────────────────────────────────────────────
  const [nameInput,   setNameInput]   = useState('');
  const [nameEditing, setNameEditing] = useState(false);
  const [nameSaving,  setNameSaving]  = useState(false);
  const [isDeleting,  setIsDeleting]  = useState(false);

  useEffect(() => {
    setNameInput(displayName ?? '');
  }, [displayName]);

  useFocusEffect(useCallback(() => {
    refreshUser();
  }, []));

  async function handleSaveName() {
    if (nameSaving) return;
    setNameSaving(true);
    const { error } = await updateProfile(nameInput);
    setNameSaving(false);
    if (error) {
      Alert.alert('保存に失敗しました', error);
    } else {
      setNameEditing(false);
    }
  }

  // ── dev フラグ状態（RevenueCat 未構成時のみ使用）────────────
  const [devPremium, setDevPremium] = useState(false);
  const [devAiPlus,  setDevAiPlus]  = useState(false);

  useEffect(() => {
    if (IS_REVENUECAT_CONFIGURED) return;
    (async () => {
      const [p, a] = await Promise.all([
        AsyncStorage.getItem(DEV_PREMIUM_KEY),
        AsyncStorage.getItem(DEV_AI_PLUS_KEY),
      ]);
      setDevPremium(p === 'true');
      setDevAiPlus(a  === 'true');
    })();
  }, []);

  const toggleDevFlag = useCallback(async (key: string, current: boolean) => {
    const next = !current;
    await AsyncStorage.setItem(key, String(next));
    if (key === DEV_PREMIUM_KEY) setDevPremium(next);
    else                          setDevAiPlus(next);
    await refresh();
  }, [refresh]);

  // ── パスワード変更メール送信 ──────────────────────────────
  async function handlePasswordChange() {
    await refreshUser();
    const email = useAuthStore.getState().user?.email;
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      const msg = /rate.?limit|too.?many/i.test(error.message)
        ? 'リクエストが多すぎます。しばらくしてから再試行してください。'
        : 'メールの送信に失敗しました。もう一度お試しください。';
      Alert.alert('送信エラー', msg);
    } else {
      Alert.alert(
        'パスワード変更メールを送信しました',
        `${email} にパスワード変更用のリンクを送りました。\nメールをご確認ください。`,
      );
    }
  }

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
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteAccount();
      // deleteAccount() 内で signOut → setSession(null) → _layout.tsx がログイン画面へ自動遷移
    } catch (e: unknown) {
      setIsDeleting(false);
      const msg = e instanceof Error ? e.message : '不明なエラー';

      const hint = msg.includes('Could not find the function') || msg.includes('does not exist')
        ? '\n\n📌 設定手順：\nSupabase Dashboard → SQL Editor で\n「007_delete_user_function.sql」を実行してください。'
        : '';

      Alert.alert('削除に失敗しました', `${msg}${hint}`);
    }
  }

  // ── アバター文字：表示名 → メール @ 前 の順でフォールバック
  const avatarLetter = (displayName ?? user?.email?.split('@')[0] ?? '?')[0]?.toUpperCase() ?? '?';

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
            {displayName ? (
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
            ) : null}
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
          {/* 表示名 */}
          <View style={styles.nameRow}>
            <View style={styles.nameRowLeft}>
              <Ionicons name="person-outline" size={20} color={COLORS.gray500} style={styles.rowIcon} />
              <Text style={styles.rowLabel}>表示名</Text>
            </View>
            {nameEditing ? (
              <View style={styles.nameEditRight}>
                <TextInput
                  style={styles.nameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="名前を入力（30文字以内）"
                  placeholderTextColor={COLORS.gray400}
                  maxLength={30}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                <TouchableOpacity onPress={handleSaveName} disabled={nameSaving} style={styles.nameSaveBtn}>
                  <Text style={styles.nameSaveBtnText}>{nameSaving ? '保存中' : '保存'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setNameEditing(false); setNameInput(displayName ?? ''); }} style={styles.nameCancelBtn}>
                  <Text style={styles.nameCancelBtnText}>キャンセル</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.nameDisplayRight} onPress={() => setNameEditing(true)}>
                <Text style={[styles.nameValue, !displayName && styles.namePlaceholder]}>
                  {displayName ?? '未設定'}
                </Text>
                <Ionicons name="pencil-outline" size={14} color={COLORS.gray400} />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.divider} />
          <SettingsRow
            icon="mail-outline"
            label="メールアドレス"
            value={user?.email ?? '不明'}
          />
          <SettingsRow
            icon="key-outline"
            label="パスワードを変更する"
            onPress={handlePasswordChange}
            isLast
          />
        </View>

        {/* ── セクション：通知設定 ── */}
        <SectionLabel label="通知設定" />
        <View style={styles.menuCard}>
          <SettingsRow
            icon="notifications-outline"
            label="通知の詳細設定"
            onPress={() => router.push('/settings/notification-settings' as never)}
            isLast
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

        {/* ── セクション：テスト用解除（RevenueCat 未構成時のみ表示） ── */}
        {__DEV__ && !IS_REVENUECAT_CONFIGURED && (
          <>
            <SectionLabel label="⚙️ 開発テスト（RC未設定時のみ表示）" />
            <View style={styles.menuCard}>
              <DevFlagRow
                label="Premium テスト解除"
                sublabel="campas_dev_premium"
                isOn={devPremium}
                onToggle={() => toggleDevFlag(DEV_PREMIUM_KEY, devPremium)}
              />
              <DevFlagRow
                label="AI Plus テスト解除"
                sublabel="campas_dev_ai_plus"
                isOn={devAiPlus}
                onToggle={() => toggleDevFlag(DEV_AI_PLUS_KEY, devAiPlus)}
                isLast
              />
            </View>
          </>
        )}

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
// 通知設定 Switch 行
// ─────────────────────────────────────────────────────────────
function SwitchRow({
  icon, label, sublabel, value, onToggle, isLast = false,
}: {
  icon:     keyof typeof Ionicons.glyphMap;
  label:    string;
  sublabel: string;
  value:    boolean;
  onToggle: () => void;
  isLast?:  boolean;
}) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Ionicons name={icon} size={20} color={COLORS.gray400} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.planSublabel}>{sublabel}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.gray200, true: COLORS.primary + '80' }}
        thumbColor={value ? COLORS.primary : COLORS.gray400}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 開発テスト用フラグ行
// ─────────────────────────────────────────────────────────────
function DevFlagRow({
  label, sublabel, isOn, onToggle, isLast = false,
}: {
  label:    string;
  sublabel: string;
  isOn:     boolean;
  onToggle: () => void;
  isLast?:  boolean;
}) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Ionicons
        name={isOn ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={isOn ? '#16A34A' : COLORS.gray300}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.planSublabel}>{sublabel}</Text>
      </View>
      <TouchableOpacity
        style={[styles.devToggleBtn, isOn && styles.devToggleBtnOn]}
        onPress={onToggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.devToggleBtnText, isOn && styles.devToggleBtnTextOn]}>
          {isOn ? 'ON  → OFF' : 'OFF → ON'}
        </Text>
      </TouchableOpacity>
    </View>
  );
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
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gray900,
  },
  userEmail: {
    fontSize: 13,
    color: COLORS.gray500,
    marginTop: 1,
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
    fontSize: 15,
    color: COLORS.gray900,
  },

  // ── 表示名行 ──────────────────────────────────────────────
  rowIcon: { width: 24, textAlign: 'center' },

  // ── 表示名行 ──────────────────────────────────────────────
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    minHeight: 52,
  },
  nameRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    marginRight: SPACING.sm,
  },
  nameDisplayRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  nameValue: {
    fontSize: 13,
    color: COLORS.gray900,
    textAlign: 'right',
  },
  namePlaceholder: {
    color: COLORS.gray400,
  },
  nameEditRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.gray900,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.primary,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  nameSaveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  nameSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  nameCancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  nameCancelBtnText: {
    fontSize: 13,
    color: COLORS.gray400,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.gray100,
    marginHorizontal: SPACING.md,
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

  // ── dev フラグトグルボタン ────────────────────────────────
  devToggleBtn: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.gray300,
    backgroundColor: COLORS.gray50,
  },
  devToggleBtnOn: {
    borderColor: '#16A34A',
    backgroundColor: '#DCFCE7',
  },
  devToggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.gray400,
  },
  devToggleBtnTextOn: {
    color: '#16A34A',
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
