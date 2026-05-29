/**
 * RevenueCat ラッパー（2 entitlement 版）
 * ─────────────────────────────────────────────────────────────
 *
 * ■ Entitlement 設計
 *   RevenueCat ダッシュボードで以下の2つを作成:
 *     premium  → 買い切り（Non-consumable）
 *     ai_plus  → 月額サブスクリプション（Auto-renewable）
 *
 * ■ 実行環境の判定
 *   expo-constants の executionEnvironment を使用:
 *     'storeClient' → Expo Go     → 課金機能を無効化
 *     'bare'        → Dev Build   → RevenueCat を動作させる
 *     'standalone'  → 本番ビルド  → RevenueCat を動作させる
 *
 * ■ Expo Go での動作
 *   - configure / purchase / restore はすべて no-op
 *   - IS_EXPO_GO フラグを export → UI側で「Dev Build限定」表示に使用
 *
 * ■ セットアップ手順（Dev Build 準備後に実施）
 *   1. https://app.revenuecat.com でプロジェクト作成
 *   2. Entitlement: "premium" と "ai_plus" を作成
 *   3. Products を App Store Connect で作成 → RC に登録
 *      - campas_premium          (Non-consumable, ¥500)
 *      - campas_ai_plus_monthly  (Auto-renewable, ¥120/月)
 *   4. .env.local に EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_xxx を設定
 * ─────────────────────────────────────────────────────────────
 */

import Constants from 'expo-constants';
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

// ── 定数 ──────────────────────────────────────────────────────

/** 買い切り Premium のエンタイトルメント識別子 */
export const PREMIUM_ENTITLEMENT  = 'premium'  as const;

/** 月額 AI Plus のエンタイトルメント識別子 */
export const AI_PLUS_ENTITLEMENT  = 'ai_plus'  as const;

export type EntitlementKey = typeof PREMIUM_ENTITLEMENT | typeof AI_PLUS_ENTITLEMENT;

/**
 * 現在の実行環境が Expo Go かどうか
 *
 * - true  → Expo Go: 課金機能を UI 側で無効化
 * - false → Dev Build / 本番: RevenueCat を正常動作させる
 */
export const IS_EXPO_GO =
  Constants.executionEnvironment === 'storeClient';

// ── ネイティブモジュールの遅延ロード ──────────────────────────

/**
 * react-native-purchases のネイティブモジュールを取得する。
 * Expo Go の場合は null を返す（ネイティブメソッドを呼ばないようにするため）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPurchases(): any | null {
  if (IS_EXPO_GO) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-purchases');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

// ── 初期化 ────────────────────────────────────────────────────

/**
 * RevenueCat を初期化してユーザーをログインさせる。
 *
 * - Expo Go では no-op（何もしない）
 * - Dev Build / 本番では configure + logIn を実行
 * - APIキーが未設定の場合は警告を出して何もしない
 *
 * @param userId Supabase の user.id（RevenueCat のユーザーIDとして使用）
 */
export async function configureRevenueCat(userId: string): Promise<void> {
  const Purchases = getPurchases();
  if (!Purchases) return;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Platform } = require('react-native');
  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ?? ''
      : process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ?? '';

  if (!apiKey || apiKey.startsWith('your-')) {
    console.warn(
      '[RevenueCat] APIキーが未設定です。\n' +
      '.env.local に EXPO_PUBLIC_REVENUECAT_API_KEY_IOS を設定してください。',
    );
    return;
  }

  try {
    await Purchases.configure({ apiKey });
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn('[RevenueCat] 初期化に失敗しました:', e);
  }
}

// ── エンタイトルメントチェック ──────────────────────────────

/**
 * 現在のユーザーが持つ全エンタイトルメントを確認する。
 * Expo Go / 取得失敗時は { isPremium: false, isAiPlus: false } を返す。
 */
export async function checkEntitlements(): Promise<{ isPremium: boolean; isAiPlus: boolean }> {
  const Purchases = getPurchases();
  if (!Purchases) return { isPremium: false, isAiPlus: false };
  try {
    const info: CustomerInfo = await Purchases.getCustomerInfo();
    return entitlementsFromCustomerInfo(info);
  } catch {
    return { isPremium: false, isAiPlus: false };
  }
}

/**
 * 後方互換：premium エンタイトルメントのみチェックする。
 * 新規コードでは checkEntitlements() を使うこと。
 */
export async function checkPremium(): Promise<boolean> {
  const { isPremium } = await checkEntitlements();
  return isPremium;
}

/**
 * CustomerInfo オブジェクトから両エンタイトルメントのフラグを取り出す。
 * 購入・復元の直後に使用する。
 */
export function entitlementsFromCustomerInfo(
  info: CustomerInfo,
): { isPremium: boolean; isAiPlus: boolean } {
  return {
    isPremium: PREMIUM_ENTITLEMENT in info.entitlements.active,
    isAiPlus:  AI_PLUS_ENTITLEMENT in info.entitlements.active,
  };
}

/**
 * 後方互換：premium フラグのみ取り出す。
 * 新規コードでは entitlementsFromCustomerInfo() を使うこと。
 */
export function isPremiumFromCustomerInfo(info: CustomerInfo): boolean {
  return PREMIUM_ENTITLEMENT in info.entitlements.active;
}

// ── オファリング ──────────────────────────────────────────────

/**
 * RevenueCat のオファリング（商品一覧）を取得する。
 * Expo Go / 取得失敗時は null を返す。
 */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    return await Purchases.getOfferings();
  } catch {
    return null;
  }
}

// ── 購入 ──────────────────────────────────────────────────────

/**
 * パッケージを購入する。
 *
 * @returns
 *   - CustomerInfo: 購入成功
 *   - null: ユーザーがキャンセル（エラーアラート不要）
 * @throws 購入失敗時（通信エラー等）はそのまま throw
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo | null> {
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean };
    if (err.userCancelled) return null;
    throw e;
  }
}

// ── 復元 ──────────────────────────────────────────────────────

/**
 * 過去の購入を復元する（App Store 審査要件）。
 * Expo Go / 失敗時は null を返す。
 */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    return await Purchases.restorePurchases();
  } catch {
    return null;
  }
}
