import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { PurchasesPackage } from 'react-native-purchases';

import {
  checkEntitlement,
  entitlementsFromCustomerInfo,
  ENTITLEMENTS,
  purchasePackage  as rcPurchasePackage,
  restorePurchases as rcRestorePurchases,
} from '@/lib/revenuecat';

/**
 * Expo Go (DEV) 用のローカルフラグ。
 * 本番ビルドでは RevenueCat が正とするため、このフラグは使われない。
 */
const DEV_PREMIUM_KEY = 'campas_dev_premium_unlocked';

type PurchaseResult = 'success' | 'cancelled' | 'error';

interface EntitlementState {
  timetable:   boolean;
  assignments: boolean;
  expenses:    boolean;
  /** ストア初期化（AsyncStorage or RC チェック）中は true */
  isLoading: boolean;

  /** RevenueCat or ローカルフラグを再チェック */
  refresh: () => Promise<void>;

  /**
   * パッケージ購入 or トライアル開始。
   *
   * - 本番ビルド + pkg あり → RevenueCat で購入
   * - Expo Go (DEV) or pkg が null → AsyncStorage ローカルフラグを立てる
   *
   * 戻り値:
   *   'success'   - 購入 or トライアル開始成功
   *   'cancelled' - ユーザーがキャンセル（エラーアラート不要）
   *   'error'     - 購入失敗（エラーアラートを出す）
   */
  purchase: (pkg: PurchasesPackage | null) => Promise<PurchaseResult>;

  /**
   * 購入を復元する（App Store 審査要件）。
   *
   * - 本番ビルド → RevenueCat restorePurchases()
   * - DEV       → ローカルフラグ確認
   *
   * @returns true = 有効な購入が見つかった
   */
  restore: () => Promise<boolean>;
}

export const useEntitlementStore = create<EntitlementState>((set) => {
  // ── ストア生成直後に非同期でローカルフラグをチェック ──────────
  (async () => {
    if (__DEV__) {
      try {
        const val = await AsyncStorage.getItem(DEV_PREMIUM_KEY);
        if (val === 'true') {
          set({ timetable: true, assignments: true, expenses: true, isLoading: false });
          return;
        }
      } catch { /* ignore */ }
    }
    set({ isLoading: false });
  })();

  return {
    timetable:   false,
    assignments: false,
    expenses:    false,
    isLoading:   true,

    // ── refresh ────────────────────────────────────────────────
    refresh: async () => {
      set({ isLoading: true });

      if (__DEV__) {
        // DEV: ローカルフラグのみ確認
        try {
          const val = await AsyncStorage.getItem(DEV_PREMIUM_KEY);
          if (val === 'true') {
            set({ timetable: true, assignments: true, expenses: true, isLoading: false });
            return;
          }
        } catch { /* ignore */ }
        set({ isLoading: false });
        return;
      }

      // 本番: RevenueCat でチェック
      try {
        const [timetable, assignments, expenses] = await Promise.all([
          checkEntitlement(ENTITLEMENTS.TIMETABLE),
          checkEntitlement(ENTITLEMENTS.ASSIGNMENTS),
          checkEntitlement(ENTITLEMENTS.EXPENSES),
        ]);
        set({ timetable, assignments, expenses, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    },

    // ── purchase ───────────────────────────────────────────────
    purchase: async (pkg) => {
      if (__DEV__ || pkg === null) {
        // DEV フォールバック: AsyncStorage にフラグを立てて全機能解除
        try {
          await AsyncStorage.setItem(DEV_PREMIUM_KEY, 'true');
          set({ timetable: true, assignments: true, expenses: true });
          return 'success';
        } catch {
          return 'error';
        }
      }

      // 本番: RevenueCat で購入
      try {
        const customerInfo = await rcPurchasePackage(pkg);
        if (!customerInfo) return 'cancelled'; // ユーザーキャンセル

        const flags = entitlementsFromCustomerInfo(customerInfo);
        set({ ...flags });
        return 'success';
      } catch {
        return 'error';
      }
    },

    // ── restore ────────────────────────────────────────────────
    restore: async () => {
      if (__DEV__) {
        // DEV: ローカルフラグを確認
        try {
          const val = await AsyncStorage.getItem(DEV_PREMIUM_KEY);
          if (val === 'true') {
            set({ timetable: true, assignments: true, expenses: true });
            return true;
          }
        } catch { /* ignore */ }
        return false;
      }

      // 本番: RevenueCat で復元
      try {
        const customerInfo = await rcRestorePurchases();
        if (!customerInfo) return false;

        const flags = entitlementsFromCustomerInfo(customerInfo);
        const hasAny = flags.timetable || flags.assignments || flags.expenses;
        if (hasAny) set({ ...flags });
        return hasAny;
      } catch {
        return false;
      }
    },
  };
});
