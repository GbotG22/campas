/**
 * エンタイトルメントストア（2 entitlement 版）
 * ─────────────────────────────────────────────────────────────
 *
 * ■ 状態
 *   isPremium: boolean  ... 買い切り Premium に加入中かどうか
 *   isAiPlus:  boolean  ... 月額 AI Plus を購読中かどうか
 *   isLoading: boolean  ... RevenueCat 確認中かどうか
 *
 * ■ 環境ごとの動作
 *   Expo Go   → AsyncStorage のローカルフラグのみ（課金なし）
 *   Dev Build → RevenueCat で実際に確認（テスト課金が動く）
 *   本番      → RevenueCat で確認
 *
 * ■ テスト用ローカルフラグ（Expo Go / 開発中）
 *   AsyncStorage に以下を保存することで各エンタイトルメントを有効化できる:
 *     'campas_dev_premium'  = 'true'  → isPremium = true
 *     'campas_dev_ai_plus'  = 'true'  → isAiPlus  = true
 * ─────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { PurchasesPackage } from 'react-native-purchases';

import {
  checkEntitlements,
  entitlementsFromCustomerInfo,
  purchasePackage  as rcPurchasePackage,
  restorePurchases as rcRestorePurchases,
  IS_EXPO_GO,
  type EntitlementKey,
} from '@/lib/revenuecat';

// ── 定数 ──────────────────────────────────────────────────────

/** Expo Go / 開発テスト用のローカルフラグキー */
const DEV_PREMIUM_KEY  = 'campas_dev_premium';
const DEV_AI_PLUS_KEY  = 'campas_dev_ai_plus';

// ── 型定義 ────────────────────────────────────────────────────

type PurchaseResult = 'success' | 'cancelled' | 'error';

interface EntitlementState {
  /** 買い切り Premium に加入中かどうか */
  isPremium: boolean;
  /** 月額 AI Plus を購読中かどうか */
  isAiPlus:  boolean;
  /** RevenueCat / AsyncStorage の確認中は true */
  isLoading: boolean;

  /**
   * エンタイトルメント状態を再取得する。
   * ログイン後・購入後・アプリ復帰時に呼ぶ。
   */
  refresh: () => Promise<void>;

  /**
   * 指定エンタイトルメントのプランを購入する。
   *
   * @param pkg        RevenueCat パッケージ（Expo Go では null）
   * @param entitlement どちらのエンタイトルメントを購入するか
   *
   * @returns
   *   'success'   - 購入成功
   *   'cancelled' - ユーザーキャンセル（エラーアラート不要）
   *   'error'     - 購入失敗（エラーアラートを出す）
   */
  purchase: (pkg: PurchasesPackage | null, entitlement: EntitlementKey) => Promise<PurchaseResult>;

  /**
   * 過去の購入を復元する（App Store 審査要件）。
   *
   * @returns true = 有効な購入が1つ以上見つかった
   */
  restore: () => Promise<boolean>;
}

// ── ストア ────────────────────────────────────────────────────

export const useEntitlementStore = create<EntitlementState>((set) => {

  // ── ストア生成直後に非同期でローカルフラグをチェック ──────
  (async () => {
    if (IS_EXPO_GO) {
      try {
        const [premVal, aiVal] = await Promise.all([
          AsyncStorage.getItem(DEV_PREMIUM_KEY),
          AsyncStorage.getItem(DEV_AI_PLUS_KEY),
        ]);
        set({
          isPremium: premVal === 'true',
          isAiPlus:  aiVal  === 'true',
          isLoading: false,
        });
        return;
      } catch { /* ignore */ }
    }
    // Dev Build / 本番: isLoading だけ解除（RevenueCat は refresh() で確認）
    set({ isLoading: false });
  })();

  return {
    isPremium: false,
    isAiPlus:  false,
    isLoading: true,

    // ────────────────────────────────────────────────────────
    // refresh
    // ────────────────────────────────────────────────────────
    refresh: async () => {
      set({ isLoading: true });

      if (IS_EXPO_GO) {
        try {
          const [premVal, aiVal] = await Promise.all([
            AsyncStorage.getItem(DEV_PREMIUM_KEY),
            AsyncStorage.getItem(DEV_AI_PLUS_KEY),
          ]);
          set({
            isPremium: premVal === 'true',
            isAiPlus:  aiVal  === 'true',
            isLoading: false,
          });
        } catch {
          set({ isLoading: false });
        }
        return;
      }

      // Dev Build / 本番: RevenueCat で両エンタイトルメントを確認
      try {
        const { isPremium, isAiPlus } = await checkEntitlements();
        set({ isPremium, isAiPlus, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    },

    // ────────────────────────────────────────────────────────
    // purchase
    // ────────────────────────────────────────────────────────
    purchase: async (pkg, entitlement) => {
      if (IS_EXPO_GO || pkg === null) {
        // Expo Go / フォールバック: 対応する AsyncStorage フラグを立てる
        try {
          const key = entitlement === 'ai_plus' ? DEV_AI_PLUS_KEY : DEV_PREMIUM_KEY;
          await AsyncStorage.setItem(key, 'true');
          if (entitlement === 'ai_plus') {
            set({ isAiPlus: true });
          } else {
            set({ isPremium: true });
          }
          return 'success';
        } catch {
          return 'error';
        }
      }

      // Dev Build / 本番: RevenueCat で購入
      // 購入後の CustomerInfo から両エンタイトルメントを更新する
      try {
        const info = await rcPurchasePackage(pkg);
        if (!info) return 'cancelled';
        const { isPremium, isAiPlus } = entitlementsFromCustomerInfo(info);
        set({ isPremium, isAiPlus });
        return 'success';
      } catch {
        return 'error';
      }
    },

    // ────────────────────────────────────────────────────────
    // restore
    // ────────────────────────────────────────────────────────
    restore: async () => {
      if (IS_EXPO_GO) {
        try {
          const [premVal, aiVal] = await Promise.all([
            AsyncStorage.getItem(DEV_PREMIUM_KEY),
            AsyncStorage.getItem(DEV_AI_PLUS_KEY),
          ]);
          const isPremium = premVal === 'true';
          const isAiPlus  = aiVal   === 'true';
          if (isPremium || isAiPlus) {
            set({ isPremium, isAiPlus });
            return true;
          }
        } catch { /* ignore */ }
        return false;
      }

      // Dev Build / 本番: RevenueCat で復元し両エンタイトルメントを更新
      try {
        const info = await rcRestorePurchases();
        if (!info) return false;
        const { isPremium, isAiPlus } = entitlementsFromCustomerInfo(info);
        if (isPremium || isAiPlus) set({ isPremium, isAiPlus });
        return isPremium || isAiPlus;
      } catch {
        return false;
      }
    },
  };
});
