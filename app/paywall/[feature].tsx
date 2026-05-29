import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { PurchasesPackage } from 'react-native-purchases';

import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { getOfferings, IS_EXPO_GO, type EntitlementKey } from '@/lib/revenuecat';
import { useEntitlementStore } from '@/stores/entitlement.store';

// ── ペイウォール種別ごとの表示定義 ───────────────────────────

const PAYWALL_INFO = {
  // ─ Premium 買い切り ────────────────────────────────────────
  premium: {
    title:        'Premium',
    icon:         '⭐',
    description:  'Googleカレンダーと連携して、授業・課題・バイトをひとつのカレンダーで確認できます。',
    accentColor:  COLORS.primary,
    entitlement:  'premium' as EntitlementKey,
    purchaseType: 'one_time' as const,
    points: [
      'Googleカレンダーの予定をアプリ内に取り込む',
      '授業・課題・バイトをひとつの画面で確認',
      '一度購入したらずっと使える買い切り',
    ],
    planLabel:  'Premium（買い切り）',
    planDetail: 'Googleカレンダー連携機能',
    fallbackPrice: '¥500',
    priceNote:  '',
    trialDays:  0,
  },

  // ─ AI Plus 月額サブスク ────────────────────────────────────
  ai_plus: {
    title:        'AI Plus',
    icon:         '✨',
    description:  'Claude AI があなたの予定・学業・バイトを毎月サポートします。',
    accentColor:  '#7C3AED',
    entitlement:  'ai_plus' as EntitlementKey,
    purchaseType: 'subscription' as const,
    points: [
      '課題・テストの優先順位提案',
      '空き時間の活用アドバイス',
      '出席危険科目の対策',
      'テスト前の学習整理',
      'バイトと学校の両立アドバイス',
    ],
    planLabel:  'AI Plus（月額）',
    planDetail: 'AI分析・アドバイス機能がすべて使える',
    fallbackPrice: '¥120',
    priceNote:  '/月',
    trialDays:  14,
  },

  // ─ 後方互換（旧タブゲート用キー）──────────────────────────
  // ※ タブ単位のペイウォールは廃止。これらは念のため残しているだけ。
  timetable: {
    title:        '時間割管理',
    icon:         '📅',
    description:  '月額プランで利用できます。',
    accentColor:  COLORS.primary,
    entitlement:  'premium' as EntitlementKey,
    purchaseType: 'one_time' as const,
    points:       ['時間割のグリッド表示', '科目ごとにカラーで識別'],
    planLabel:    'Premium（買い切り）',
    planDetail:   '一度払えばずっと使える',
    fallbackPrice: '¥500',
    priceNote:    '',
    trialDays:    0,
  },
  schedule: {
    title:        '予定管理',
    icon:         '📋',
    description:  'プレミアムプランで利用できます。',
    accentColor:  COLORS.success,
    entitlement:  'premium' as EntitlementKey,
    purchaseType: 'one_time' as const,
    points:       ['課題・テスト・バイトを一括管理'],
    planLabel:    'Premium（買い切り）',
    planDetail:   '一度払えばずっと使える',
    fallbackPrice: '¥500',
    priceNote:    '',
    trialDays:    0,
  },
  money: {
    title:        'お金の管理',
    icon:         '💰',
    description:  'プレミアムプランで利用できます。',
    accentColor:  COLORS.warning,
    entitlement:  'premium' as EntitlementKey,
    purchaseType: 'one_time' as const,
    points:       ['支出のカテゴリ別グラフ'],
    planLabel:    'Premium（買い切り）',
    planDetail:   '一度払えばずっと使える',
    fallbackPrice: '¥500',
    priceNote:    '',
    trialDays:    0,
  },
  assignments: {
    title:        '予定管理',
    icon:         '📋',
    description:  'プレミアムプランで利用できます。',
    accentColor:  COLORS.success,
    entitlement:  'premium' as EntitlementKey,
    purchaseType: 'one_time' as const,
    points:       ['課題・テスト・バイトを一括管理'],
    planLabel:    'Premium（買い切り）',
    planDetail:   '一度払えばずっと使える',
    fallbackPrice: '¥500',
    priceNote:    '',
    trialDays:    0,
  },
  expenses: {
    title:        'お金の管理',
    icon:         '💰',
    description:  'プレミアムプランで利用できます。',
    accentColor:  COLORS.warning,
    entitlement:  'premium' as EntitlementKey,
    purchaseType: 'one_time' as const,
    points:       ['支出のカテゴリ別グラフ'],
    planLabel:    'Premium（買い切り）',
    planDetail:   '一度払えばずっと使える',
    fallbackPrice: '¥500',
    priceNote:    '',
    trialDays:    0,
  },
} as const;

type FeatureKey = keyof typeof PAYWALL_INFO;

// ─────────────────────────────────────────────────────────────
// Paywall 画面
// ─────────────────────────────────────────────────────────────
export default function PaywallScreen() {
  const { feature } = useLocalSearchParams<{ feature: string }>();
  const { purchase, restore } = useEntitlementStore();

  const [loading,      setLoading]      = useState(false);
  const [offerLoading, setOfferLoading] = useState(!IS_EXPO_GO);
  const [pkg,          setPkg]          = useState<PurchasesPackage | null>(null);

  const info = PAYWALL_INFO[feature as FeatureKey];

  // ── RevenueCat オファリング取得（Dev Build / 本番のみ） ────
  useEffect(() => {
    if (IS_EXPO_GO || !info) return;

    (async () => {
      try {
        const offerings = await getOfferings();
        const found = offerings?.current?.availablePackages?.[0] ?? null;
        setPkg(found);
      } catch { /* フォールバック価格を表示する */ }
      setOfferLoading(false);
    })();
  }, [info]);

  if (!info) {
    router.back();
    return null;
  }

  const isSubscription = info.purchaseType === 'subscription';

  // 価格表示
  const priceLabel = pkg?.product.priceString ?? info.fallbackPrice;

  // ── 購入処理 ──────────────────────────────────────────────
  async function handlePurchase() {
    setLoading(true);
    try {
      const pkgToUse = IS_EXPO_GO ? null : pkg;
      const result = await purchase(pkgToUse, info.entitlement);

      if (result === 'cancelled') return;

      if (result === 'error') {
        Alert.alert(
          'エラー',
          '購入処理に失敗しました。\nネットワーク接続を確認してから再度お試しください。',
        );
        return;
      }

      const planName = info.entitlement === 'ai_plus' ? 'AI Plus' : 'Premium';
      const successMsg = IS_EXPO_GO
        ? `✅ テスト解除しました（Expo Go モード）\n${planName} の機能が使えます。`
        : `🎉 ${planName} が有効になりました！`;

      Alert.alert('完了', successMsg, [
        { text: '使ってみる', onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // ── 購入復元 ──────────────────────────────────────────────
  async function handleRestore() {
    setLoading(true);
    try {
      const restored = await restore();
      if (restored) {
        Alert.alert('✅ 復元完了', '購入が確認できました。', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert(
          '購入履歴なし',
          '復元できる購入履歴が見つかりませんでした。\nお使いの Apple ID をご確認ください。',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  // ── オファリング取得中 ────────────────────────────────────
  if (offerLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={info.accentColor} />
        <Text style={{ color: COLORS.gray400, marginTop: 12 }}>価格情報を取得中...</Text>
      </SafeAreaView>
    );
  }

  // ── UI ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 戻るボタン */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backText}>← 戻る</Text>
        </TouchableOpacity>

        {/* Expo Go 専用バナー */}
        {IS_EXPO_GO && (
          <View style={styles.expoGoBanner}>
            <Ionicons name="information-circle" size={20} color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.expoGoBannerTitle}>開発版アプリ（Dev Build）で利用可能</Text>
              <Text style={styles.expoGoBannerBody}>
                Expo Go では実際の課金は行われません。{'\n'}
                「試す」ボタンでテスト用に機能を解除できます。
              </Text>
            </View>
          </View>
        )}

        {/* ヒーローアイコン */}
        <View style={[styles.iconWrap, { backgroundColor: info.accentColor + '18' }]}>
          <Text style={styles.icon}>{info.icon}</Text>
        </View>
        <Text style={styles.title}>{info.title}</Text>
        <Text style={styles.description}>{info.description}</Text>

        {/* 機能ポイント */}
        <View style={styles.pointsCard}>
          {info.points.map((p, i) => (
            <View key={i} style={styles.pointRow}>
              <View style={[styles.pointDot, { backgroundColor: info.accentColor }]} />
              <Text style={styles.pointText}>{p}</Text>
            </View>
          ))}
        </View>

        {/* トライアルバナー（サブスクかつ Dev Build / 本番のみ） */}
        {isSubscription && !IS_EXPO_GO && info.trialDays > 0 && (
          <View style={[styles.trialBanner, { backgroundColor: info.accentColor + '15' }]}>
            <Text style={styles.trialBannerEmoji}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.trialBannerTitle, { color: info.accentColor }]}>
                {info.trialDays}日間 無料トライアル
              </Text>
              <Text style={[styles.trialBannerSub, { color: info.accentColor }]}>
                全機能を無料でお試しいただけます
              </Text>
            </View>
          </View>
        )}

        {/* 買い切りバッジ（Premium のみ） */}
        {!isSubscription && (
          <View style={[styles.oneTimeBanner, { borderColor: info.accentColor }]}>
            <Text style={[styles.oneTimeBannerText, { color: info.accentColor }]}>
              ⭐ 一度購入したらずっと使える買い切りプランです
            </Text>
          </View>
        )}

        {/* プラン表示 */}
        <Text style={styles.sectionLabel}>プラン</Text>
        <View style={[styles.planCard, { borderColor: info.accentColor }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.planLabel}>{info.planLabel}</Text>
            <Text style={styles.planDetail}>{info.planDetail}</Text>
          </View>
          <Text style={[styles.planPrice, { color: info.accentColor }]}>
            {IS_EXPO_GO ? '（テスト）' : priceLabel}
            {!IS_EXPO_GO && info.priceNote
              ? <Text style={styles.planPeriod}>{info.priceNote}</Text>
              : null
            }
          </Text>
        </View>

        {/* 注意書き（サブスクかつ本番のみ） */}
        {isSubscription && !IS_EXPO_GO && (
          <Text style={styles.notice}>
            ※ {info.trialDays > 0 ? `${info.trialDays}日間の無料トライアル終了後、` : ''}月額プランで自動更新されます。{'\n'}
            キャンセルはいつでも可能です。
          </Text>
        )}

        {/* 購入 / テスト解除ボタン */}
        <TouchableOpacity
          style={[
            styles.purchaseBtn,
            { backgroundColor: info.accentColor },
            loading && { opacity: 0.6 },
          ]}
          onPress={handlePurchase}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.purchaseBtnText}>
                {IS_EXPO_GO
                  ? '✅ テスト用に解除する'
                  : isSubscription
                    ? `${info.trialDays > 0 ? `${info.trialDays}日間 無料で試す` : '購読を開始する'}`
                    : `${priceLabel} で購入する（買い切り）`
                }
              </Text>
          }
        </TouchableOpacity>

        {/* 購入復元（App Store 審査要件・Dev Build / 本番のみ） */}
        {!IS_EXPO_GO && (
          <TouchableOpacity
            style={styles.restoreBtn}
            onPress={handleRestore}
            disabled={loading}
          >
            <Text style={styles.restoreBtnText}>購入を復元する</Text>
          </TouchableOpacity>
        )}

        {/* 法的リンク */}
        <View style={styles.legalRow}>
          <TouchableOpacity onPress={() => router.push('/legal/terms' as never)}>
            <Text style={[styles.legalText, styles.legalLink]}>利用規約</Text>
          </TouchableOpacity>
          <Text style={styles.legalSep}>・</Text>
          <TouchableOpacity onPress={() => router.push('/legal/privacy' as never)}>
            <Text style={[styles.legalText, styles.legalLink]}>プライバシーポリシー</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// スタイル
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  scroll:    { padding: 24, paddingBottom: 48 },

  backBtn:  { marginBottom: 16 },
  backText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },

  // Expo Go バナー
  expoGoBanner: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'flex-start',
    backgroundColor: COLORS.warningLight,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.amberBorder,
  },
  expoGoBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 2 },
  expoGoBannerBody:  { fontSize: 12, color: '#92400E', lineHeight: 18 },

  // ヒーロー
  iconWrap: {
    width: 88, height: 88, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 16,
  },
  icon:        { fontSize: 44 },
  title:       { fontSize: 26, fontWeight: '800', color: COLORS.gray900, textAlign: 'center', marginBottom: 10 },
  description: { fontSize: 15, color: COLORS.gray600, textAlign: 'center', lineHeight: 22, marginBottom: 20 },

  // 機能ポイント
  pointsCard: {
    backgroundColor: COLORS.gray50, borderRadius: 14,
    padding: 16, gap: 10, marginBottom: 20,
  },
  pointRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointDot:  { width: 7, height: 7, borderRadius: 4 },
  pointText: { fontSize: 14, color: COLORS.gray600, flex: 1 },

  // トライアルバナー（サブスク用）
  trialBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, marginBottom: 24,
  },
  trialBannerEmoji: { fontSize: 28 },
  trialBannerTitle: { fontSize: 14, fontWeight: '700' },
  trialBannerSub:   { fontSize: 12, opacity: 0.8, marginTop: 2 },

  // 買い切りバナー（Premium 用）
  oneTimeBanner: {
    borderRadius: 12, borderWidth: 1.5,
    padding: 12, marginBottom: 24, alignItems: 'center',
  },
  oneTimeBannerText: { fontSize: 13, fontWeight: '700' },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.gray400, marginBottom: 10 },

  // プランカード
  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderRadius: 14,
    padding: 16, marginBottom: 10, backgroundColor: COLORS.gray50,
  },
  planLabel:  { fontSize: 15, fontWeight: '700', color: COLORS.gray900 },
  planDetail: { fontSize: 12, color: COLORS.gray400, marginTop: 3 },
  planPrice:  { fontSize: 18, fontWeight: '800' },
  planPeriod: { fontSize: 12, fontWeight: '400', color: COLORS.gray400 },

  notice: { fontSize: 11, color: COLORS.gray400, lineHeight: 16, marginBottom: 28, textAlign: 'center' },

  // ボタン
  purchaseBtn:     { borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 14, marginTop: 8 },
  purchaseBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  restoreBtn:     { alignItems: 'center', paddingVertical: 10, marginBottom: 16 },
  restoreBtnText: { color: COLORS.gray400, fontSize: 14 },

  // 法的リンク
  legalRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  legalText: { color: COLORS.gray400, fontSize: 12 },
  legalLink: { color: COLORS.primary, textDecorationLine: 'underline' },
  legalSep:  { color: COLORS.gray400, fontSize: 12 },
});
