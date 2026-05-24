/**
 * 通知ヘルパー
 * expo-notifications を遅延 require() で読み込み、
 * Expo Go で native module が利用できない場合でもクラッシュしないようにする
 */
import type { Database } from '@/types/database';

type Assignment   = Database['public']['Tables']['assignments']['Row'];
type Subscription = Database['public']['Tables']['subscriptions']['Row'];

// ── 遅延ロード ────────────────────────────────────────────
function getNotifications() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
}

// ── ハンドラー初期化（アプリ起動時に一度だけ呼ぶ） ──────────
export function initNotificationHandler() {
  try {
    const N = getNotifications();
    if (!N) return;
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch { /* ignore */ }
}

// ── 通知カテゴリ（サブスク更新の選択肢） ─────────────────────
export const SUBSCRIPTION_CATEGORY = 'subscription_renewal';

export async function registerNotificationCategories() {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.setNotificationCategoryAsync(SUBSCRIPTION_CATEGORY, [
      { identifier: 'continue',   buttonTitle: 'このまま継続', options: { opensAppToForeground: false } },
      { identifier: 'reconsider', buttonTitle: '解約を検討',   options: { opensAppToForeground: true } },
    ]);
  } catch { /* ignore */ }
}

// ── 権限リクエスト ─────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const N = getNotifications();
    if (!N) return false;
    const { status } = await N.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// 課題通知
// ═══════════════════════════════════════════════════════════

export async function scheduleAssignmentNotifications(a: Assignment) {
  if (!a.due_date) return;
  const N = getNotifications();
  if (!N) return;

  const due = new Date(a.due_date);
  due.setHours(9, 0, 0, 0);
  const now = new Date();

  const triggers = [
    { id: `${a.id}_3d`, title: '📚 課題の締切3日前', body: `「${a.title}」の締切まであと3日です`, offset: -3 },
    { id: `${a.id}_1d`, title: '⚠️ 課題の締切は明日', body: `「${a.title}」の締切は明日です！`,  offset: -1 },
    { id: `${a.id}_0d`, title: '🔥 課題の締切は今日', body: `「${a.title}」の締切は今日です！`,  offset:  0 },
  ];

  for (const t of triggers) {
    const date = new Date(due);
    date.setDate(date.getDate() + t.offset);
    if (date <= now) continue;
    try {
      await N.scheduleNotificationAsync({
        identifier: t.id,
        content: { title: t.title, body: t.body, sound: true },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date },
      });
    } catch { /* ignore */ }
  }
}

export async function cancelAssignmentNotifications(id: string) {
  try {
    const N = getNotifications();
    if (!N) return;
    await Promise.all([
      N.cancelScheduledNotificationAsync(`${id}_3d`),
      N.cancelScheduledNotificationAsync(`${id}_1d`),
      N.cancelScheduledNotificationAsync(`${id}_0d`),
    ]);
  } catch { /* ignore */ }
}

export async function rescheduleAllNotifications(assignments: Assignment[]) {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.cancelAllScheduledNotificationsAsync();
    for (const a of assignments) {
      if (a.status !== 'done') await scheduleAssignmentNotifications(a);
    }
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
// サブスク通知
// ═══════════════════════════════════════════════════════════

/** renewal_day から次回更新日を返す */
export function getNextRenewalDate(renewalDay: number): Date {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), renewalDay);
  return thisMonth > now
    ? thisMonth
    : new Date(now.getFullYear(), now.getMonth() + 1, renewalDay);
}

/** 次回更新まで何日か */
export function daysUntilRenewal(renewalDay: number): number {
  const next = getNextRenewalDate(renewalDay);
  return Math.ceil((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/** サブスク更新3日前の通知をスケジュール */
export async function scheduleSubscriptionNotification(sub: Subscription) {
  try {
    const N = getNotifications();
    if (!N) return;
    const next = getNextRenewalDate(sub.renewal_day);
    const triggerDate = new Date(next);
    triggerDate.setDate(triggerDate.getDate() - 3);
    triggerDate.setHours(9, 0, 0, 0);
    if (triggerDate <= new Date()) return;

    await N.scheduleNotificationAsync({
      identifier: `sub_${sub.id}_renewal`,
      content: {
        title: '🔔 サブスク更新のお知らせ',
        body: `${sub.service_name}が3日後に¥${sub.amount.toLocaleString()}更新されます`,
        sound: true,
        categoryIdentifier: SUBSCRIPTION_CATEGORY,
        data: { subscriptionId: sub.id, type: 'renewal' },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  } catch { /* ignore */ }
}

/** 3ヶ月間支出がないサブスクの通知 */
export async function scheduleUnusedSubscriptionNotification(sub: Subscription) {
  try {
    const N = getNotifications();
    if (!N) return;
    const date = new Date(Date.now() + 5 * 60 * 1000);
    await N.scheduleNotificationAsync({
      identifier: `sub_${sub.id}_unused`,
      content: {
        title: '💭 本当に使っていますか？',
        body: `${sub.service_name}（¥${sub.amount.toLocaleString()}/月）の支出が3ヶ月間記録されていません`,
        sound: true,
        categoryIdentifier: SUBSCRIPTION_CATEGORY,
        data: { subscriptionId: sub.id, type: 'unused' },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date },
    });
  } catch { /* ignore */ }
}

export async function cancelSubscriptionNotifications(id: string) {
  try {
    const N = getNotifications();
    if (!N) return;
    await Promise.all([
      N.cancelScheduledNotificationAsync(`sub_${id}_renewal`),
      N.cancelScheduledNotificationAsync(`sub_${id}_unused`),
    ]);
  } catch { /* ignore */ }
}

/** アクティブなサブスク通知を一括再スケジュール */
export async function rescheduleSubscriptionNotifications(
  subscriptions: Subscription[],
  recentExpenseTitles: string[],
) {
  try {
    const N = getNotifications();
    if (!N) return;
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith('sub_'))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );

    for (const sub of subscriptions) {
      if (!sub.is_active) continue;
      await scheduleSubscriptionNotification(sub);
      const hasRecord = recentExpenseTitles.some(t =>
        t.toLowerCase().includes(sub.service_name.toLowerCase()),
      );
      if (!hasRecord) await scheduleUnusedSubscriptionNotification(sub);
    }
  } catch { /* ignore */ }
}
