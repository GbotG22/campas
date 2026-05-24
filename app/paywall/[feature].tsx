import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PurchasesPackage } from 'react-native-purchases';

import { COLORS } from '@/constants/theme';
import { findPackage } from '@/lib/revenuecat';
import { useEntitlementStore } from '@/stores/entitlement.store';

// ── 機能ごとの説明 ────────────────────────────────────────────

const FEATURE_INFO = {
  timetable: {
    title:       '時間割管理',
    icon:        '📅',
    description: '授業スケジュールをグリッドで管理。科目・教室・担当教員をまとめて記録できます。',
    accentColor: COLORS.primary,
    points: [
      '月〜金の時間割をグリッド表示',
      '科目ごとにカラーで識別',
      'タップで追加・編集、長押しで削除',
    ],
  },
  assignments: {
    title:       '課題・TODO管理',
    icon:        '✅',
    description: '締切日ベースの優先度スコアで課題を自動整理。うっかり提出忘れを防ぎます。',
    accentColor: COLORS.success,
    points: [
      '締切が近い課題を自動で上に表示',
      '高・中・低の優先度設定',
      '期限切れ・今日・明日のバッジ表示',
    ],
  },
  expenses: {
    title:       '支出・サブスク管理',
    icon:        '💰',
    description: '日々の支出とサブスクを一元管理。カテゴリ別グラフで無駄な出費を見える化します。',
    accentColor: COLORS.warning,
    points: [
      '支出のカテゴリ別グラフ',
      '月予算の設定と超過アラート',
      'サブスクの更新日カウントダウン',
    ],
  },
} as const;

type FeatureKey = keyof typeof FEATURE_INFO;

// ── プラン定義（RC 未接続時のフォールバック価格） ────────────

const PLAN_FALLBACK = [
  {
    id:        'all' as const,
    label:     '全機能セット',
    detail:    '時間割・課題・支出 すべて使える',
    price:     '¥500',
    period:    '/月',
    badge:     'お得',
    highlight: true,
  },
  {
    id:        'single' as const,
    label:     'この機能だけ',
    detail:    '今選択している機能のみ',
    price:     '¥100',
    period:    '/月',
    badge:     null,
    highlight: false,
  },
] as const;

type PlanId = 'all' | 'single';

export default function PaywallScreen() {
  const { feature } = useLocalSearchParams<{ feature: string }>();
  const { purchase, restore } = useEntitlementStore();

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('all');
  const [loading,      setLoading]      = useState(false);
  const [offerLoading, setOfferLoading] = useState(!__DEV__); // 本番のみ取得

  // パッケージ（本番ビルドのみ取得）
  const [allPackage,    setAllPackage]    = useState<PurchasesPackage | null>(null);
  const [singlePackage, setSinglePackage] = useState<PurchasesPackage | null>(null);

  const info = FEATURE_INFO[feature as FeatureKey];

  // RevenueCat オファリング取得（本番ビルド時のみ実行）
  useEffect(() => {
    if (__DEV__ || !info) return;

    (async () => {
      try {
        const [all, single] = await Promise.all([
          findPackage(feature as FeatureKey, 'all'),
          findPackage(feature as FeatureKey, 'single'),
        ]);
        setAllPackage(all);
        setSinglePackage(single);
      } catch { /* ignore — フォールバック価格を使う */ }
      setOfferLoading(false);
    })();
  }, [feature, info]);

  if (!info) {
    router.back();
    return null;
  }

  // 選択されたプランに対応する RC パッケージ（本番のみ存在）
  function getSelectedPackage(): PurchasesPackage | null {
    if (__DEV__) return null; // DEV は null → store 側がフォールバック処理
    return selectedPlan === 'all' ? allPackage : singlePackage;
  }

  // 価格表示（RC から取れた場合は実際の価格、取れない場合はフォールバック）
  function getPriceLabel(planId: PlanId): string {
    if (!__DEV__) {
      const pkg = planId === 'all' ? allPackage : singlePackage;
      if (pkg) return pkg.product.priceString; // RC から取得した実際の価格
    }
    return PLAN_FALLBACK.find(p => p.id === planId)?.price ?? '-';
  }

  // ── トライアル / 購入 ───────────────────────────────────────

  async function handlePurchase() {
    setLoading(true);
    try {
      const pkg = getSelectedPackage();
      const result = await purchase(pkg);

      if (result === 'cancelled') {
        // ユーザーがキャンセル → 何もしない
        return;
      }
      if (result === 'error') {
        Alert.alert(
          'エラー',
          '購入処理に失敗しました。\nネットワーク接続を確認してから再度お試しください。',
        );
        return;
      }

      // success
      Alert.alert(
        '🎉 トライアル開始！',
        '14日間、全機能が無料で使えます。\nキャンセルはいつでも可能です。',
        [{ text: '使ってみる', onPress: () => router.back() }],
      );
    } finally {
      setLoading(false);
    }
  }

  // ── 購入復元 ────────────────────────────────────────────────

  async function handleRestore() {
    setLoading(true);
    try {
      const restored = await restore();
      if (restored) {
        Alert.alert(
          '✅ 復元完了',
          '購入が確認できました。',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        Alert.alert(
          '購入履歴なし',
          '復元できる購入履歴が見つかりませんでした。\nお使いのApple ID / Google アカウントをご確認ください。',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  // ── 読み込み中 ───────────────────────────────────────────────

  if (offerLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.gray400, marginTop: 12 }}>価格情報を取得中...</Text>
      </SafeAreaView>
    );
  }

  // ── UI ───────────────────────────────────────────────────────

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

        {/* トライアルバナー */}
        <View style={styles.trialBanner}>
          <Text style={styles.trialBannerEmoji}>🎁</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.trialBannerTitle}>14日間 無料トライアル</Text>
            <Text style={styles.trialBannerSub}>全機能を無料でお試しいただけます</Text>
          </View>
        </View>

        {/* プラン選択 */}
        <Text style={styles.sectionLabel}>プランを選択</Text>
        {PLAN_FALLBACK.map(plan => {
          const selected = selectedPlan === plan.id;
          const priceLabel = getPriceLabel(plan.id);
          return (
            <TouchableOpacity
              key={plan.id}
              style={[styles.planCard, selected && styles.planCardSelected]}
              onPress={() => setSelectedPlan(plan.id)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.planLabel, selected && { color: COLORS.primary }]}>
                    {plan.label}
                  </Text>
                  {plan.badge && (
                    <View style={styles.planBadge}>
                      <Text style={styles.planBadgeText}>{plan.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planDetail}>{plan.detail}</Text>
              </View>
              <Text style={[styles.planPrice, selected && { color: COLORS.primary }]}>
                {priceLabel}
                <Text style={styles.planPeriod}>/月</Text>
              </Text>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* 注意書き */}
        <Text style={styles.notice}>
          ※ 14日間の無料トライアル終了後、選択したプランで自動更新されます。
          キャンセルはいつでも可能です。
        </Text>

        {/* 購入ボタン */}
        <TouchableOpacity
          style={[styles.trialBtn, loading && { opacity: 0.6 }]}
          onPress={handlePurchase}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.trialBtnText}>14日間 無料で試す</Text>
          }
        </TouchableOpacity>

        {/* 購入復元（App Store 審査要件） */}
        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={handleRestore}
          disabled={loading}
        >
          <Text style={styles.restoreBtnText}>購入を復元する</Text>
        </TouchableOpacity>

        {/* 法的リンク */}
        <View style={styles.legalRow}>
          <Text style={styles.legalText}>利用規約</Text>
          <Text style={styles.legalSep}>・</Text>
          <Text style={styles.legalText}>プライバシーポリシー</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.white },
  scroll:     { padding: 24, paddingBottom: 48 },

  backBtn:    { marginBottom: 20 },
  backText:   { color: COLORS.primary, fontSize: 15, fontWeight: '600' },

  iconWrap: {
    width: 88, height: 88, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 16,
  },
  icon:        { fontSize: 44 },
  title:       { fontSize: 26, fontWeight: '800', color: COLORS.gray900, textAlign: 'center', marginBottom: 10 },
  description: { fontSize: 15, color: COLORS.gray600, textAlign: 'center', lineHeight: 22, marginBottom: 20 },

  pointsCard: {
    backgroundColor: COLORS.gray50, borderRadius: 14,
    padding: 16, gap: 10, marginBottom: 20,
  },
  pointRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointDot:  { width: 7, height: 7, borderRadius: 4 },
  pointText: { fontSize: 14, color: COLORS.gray600, flex: 1 },

  trialBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.successLight, borderRadius: 14,
    padding: 14, marginBottom: 24,
  },
  trialBannerEmoji: { fontSize: 28 },
  trialBannerTitle: { fontSize: 14, fontWeight: '700', color: COLORS.success },
  trialBannerSub:   { fontSize: 12, color: COLORS.success, opacity: 0.8, marginTop: 2 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.gray400, marginBottom: 10, letterSpacing: 0.5 },

  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: 14,
    padding: 16, marginBottom: 10, backgroundColor: COLORS.white,
  },
  planCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  planLabel:        { fontSize: 15, fontWeight: '700', color: COLORS.gray900 },
  planDetail:       { fontSize: 12, color: COLORS.gray400, marginTop: 3 },
  planBadge:        { backgroundColor: COLORS.warning + '25', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  planBadgeText:    { fontSize: 11, fontWeight: '700', color: COLORS.warning },
  planPrice:        { fontSize: 18, fontWeight: '800', color: COLORS.gray900 },
  planPeriod:       { fontSize: 12, fontWeight: '400', color: COLORS.gray400 },
  radio:         { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.gray200, justifyContent: 'center', alignItems: 'center' },
  radioSelected: { borderColor: COLORS.primary },
  radioDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },

  notice: { fontSize: 11, color: COLORS.gray400, lineHeight: 16, marginBottom: 28, textAlign: 'center' },

  trialBtn:     { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 14 },
  trialBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  restoreBtn:     { alignItems: 'center', paddingVertical: 10, marginBottom: 16 },
  restoreBtnText: { color: COLORS.gray400, fontSize: 14 },

  legalRow: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  legalText: { color: COLORS.gray400, fontSize: 12 },
  legalSep:  { color: COLORS.gray400, fontSize: 12 },
});
