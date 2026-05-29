/**
 * usePremium — エンタイトルメント判定フック（2 entitlement 版）
 * ─────────────────────────────────────────────────────────────
 *
 * ■ 使い方
 *   const { isPremium, isAiPlus, isLoading, isExpoGo } = usePremium();
 *
 *   // Premium 機能ゲート
 *   if (!isPremium) {
 *     router.push('/paywall/premium');
 *     return;
 *   }
 *
 *   // AI Plus 機能ゲート
 *   if (!isAiPlus) {
 *     router.push('/paywall/ai_plus');
 *     return;
 *   }
 *
 * ■ isExpoGo について
 *   Expo Go では RevenueCat が動作しない。
 *   isExpoGo === true のとき、UI 側で
 *   「この機能は開発版アプリ（Dev Build）で利用できます」と表示する。
 * ─────────────────────────────────────────────────────────────
 */

import { useEntitlementStore } from '@/stores/entitlement.store';
import { IS_EXPO_GO, type EntitlementKey } from '@/lib/revenuecat';
import type { PurchasesPackage } from 'react-native-purchases';

// ── 型定義 ────────────────────────────────────────────────────

type PurchaseResult = 'success' | 'cancelled' | 'error';

interface UsePremiumReturn {
  /** 買い切り Premium に加入中かどうか */
  isPremium: boolean;
  /** 月額 AI Plus を購読中かどうか */
  isAiPlus:  boolean;
  /** RevenueCat / ストア確認中は true */
  isLoading: boolean;
  /**
   * 現在 Expo Go で実行中かどうか。
   * true のとき課金機能は動作しない（UI で案内表示を出すこと）
   */
  isExpoGo: boolean;
  /**
   * 指定エンタイトルメントのプランを購入する。
   * - Expo Go / pkg=null → テスト用フラグをセット
   * - Dev Build / 本番   → RevenueCat で実際に購入
   */
  purchase: (pkg: PurchasesPackage | null, entitlement: EntitlementKey) => Promise<PurchaseResult>;
  /**
   * 過去の購入を復元する（App Store 審査要件）
   */
  restore: () => Promise<boolean>;
  /**
   * エンタイトルメント状態を再取得する（ログイン後・アプリ復帰時に使う）
   */
  refresh: () => Promise<void>;
}

// ── フック ────────────────────────────────────────────────────

export function usePremium(): UsePremiumReturn {
  const {
    isPremium,
    isAiPlus,
    isLoading,
    purchase,
    restore,
    refresh,
  } = useEntitlementStore();

  return {
    isPremium,
    isAiPlus,
    isLoading,
    isExpoGo: IS_EXPO_GO,
    purchase,
    restore,
    refresh,
  };
}
