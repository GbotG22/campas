/**
 * RevenueCat ラッパー
 *
 * react-native-purchases はネイティブモジュールのため Expo Go では動作しない。
 * __DEV__ (Expo Go) のときはすべて no-op / null を返し、
 * 本番ビルド (EAS Build) のときだけ実際の購入処理を行う。
 *
 * ── RevenueCat ダッシュボード設定 ──────────────────────────────
 *  Entitlements:
 *    timetable / assignments / expenses
 *
 *  Products (App Store Connect / Play Store で先に作成):
 *    campas_all_monthly        ¥500/月  → timetable + assignments + expenses
 *    campas_timetable_monthly  ¥100/月  → timetable
 *    campas_assignments_monthly¥100/月  → assignments
 *    campas_expenses_monthly   ¥100/月  → expenses
 *
 *  Offering (identifier: default):
 *    Package identifier → Product
 *    all_monthly        → campas_all_monthly
 *    timetable_monthly  → campas_timetable_monthly
 *    assignments_monthly→ campas_assignments_monthly
 *    expenses_monthly   → campas_expenses_monthly
 * ──────────────────────────────────────────────────────────────
 */

// 型のみのインポート（ランタイムには影響なし）
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

// ── 定数 ──────────────────────────────────────────────────────

export const ENTITLEMENTS = {
  TIMETABLE:   'timetable',
  ASSIGNMENTS: 'assignments',
  EXPENSES:    'expenses',
} as const;

export type Entitlement = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS];

/** RevenueCat ダッシュボードの Package identifier と一致させること */
export const RC_PACKAGE_IDS = {
  ALL:         'all_monthly',
  TIMETABLE:   'timetable_monthly',
  ASSIGNMENTS: 'assignments_monthly',
  EXPENSES:    'expenses_monthly',
} as const;

export type FeaturePackageId = 'timetable' | 'assignments' | 'expenses';

// ── 遅延ロード ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPurchases(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-purchases');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

// ── 初期化 ────────────────────────────────────────────────────

export async function initRevenueCat(userId: string): Promise<void> {
  if (__DEV__) return; // Expo Go では完全スキップ
  const Purchases = getPurchases();
  if (!Purchases) return;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Platform } = require('react-native');
  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS!
      : process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID!;

  try {
    await Purchases.configure({ apiKey });
    await Purchases.logIn(userId);
  } catch { /* API キー未設定などは無視 */ }
}

// ── カスタマー情報 ────────────────────────────────────────────

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (__DEV__) return null;
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/** CustomerInfo から各機能の解除状態を取り出す */
export function entitlementsFromCustomerInfo(info: CustomerInfo) {
  const active = info.entitlements.active;
  return {
    timetable:   ENTITLEMENTS.TIMETABLE   in active,
    assignments: ENTITLEMENTS.ASSIGNMENTS in active,
    expenses:    ENTITLEMENTS.EXPENSES    in active,
  };
}

export async function checkEntitlement(entitlement: Entitlement): Promise<boolean> {
  const info = await getCustomerInfo();
  if (!info) return false;
  return entitlement in info.entitlements.active;
}

// ── オファリング ──────────────────────────────────────────────

export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (__DEV__) return null; // Expo Go では null → UI 側でフォールバック
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    return await Purchases.getOfferings();
  } catch {
    return null;
  }
}

/**
 * 現在の Offering からパッケージを取得する便利関数。
 * feature: 'timetable' | 'assignments' | 'expenses'
 * planType: 'all' | 'single'
 */
export async function findPackage(
  feature: FeaturePackageId,
  planType: 'all' | 'single',
): Promise<PurchasesPackage | null> {
  const offerings = await getOfferings();
  if (!offerings?.current) return null;

  const pkgId = planType === 'all'
    ? RC_PACKAGE_IDS.ALL
    : RC_PACKAGE_IDS[feature.toUpperCase() as keyof typeof RC_PACKAGE_IDS];

  return offerings.current.availablePackages.find(p => p.identifier === pkgId) ?? null;
}

// ── 購入 ──────────────────────────────────────────────────────

/**
 * パッケージを購入する。
 * @returns
 *   - CustomerInfo: 購入成功
 *   - null: ユーザーがキャンセル（エラーアラート不要）
 * @throws 購入失敗時（通信エラー等）
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean };
    if (err.userCancelled) return null; // キャンセルはエラー扱いしない
    throw e;
  }
}

// ── 復元 ──────────────────────────────────────────────────────

/**
 * 過去の購入を復元する。
 * @returns CustomerInfo（復元済み）or null（失敗・Expo Go）
 */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (__DEV__) return null;
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    return await Purchases.restorePurchases();
  } catch {
    return null;
  }
}
