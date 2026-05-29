/**
 * 通知ヘルパー
 * expo-notifications を遅延 require() で読み込み、
 * Expo Go で native module が利用できない場合でもクラッシュしないようにする
 */
import type { Database } from '@/types/database';

type Assignment   = Database['public']['Tables']['assignments']['Row'];
type Subscription = Database['public']['Tables']['subscriptions']['Row'];
type AppEvent     = Database['public']['Tables']['events']['Row'];
type ShiftRow     = Database['public']['Tables']['shifts']['Row'];

// ── イベント通知の対象タイプ ──────────────────────────────────────
const NOTIFIABLE_EVENT_TYPES = ['assignment', 'test', 'report'] as const;
type NotifiableEventType = typeof NOTIFIABLE_EVENT_TYPES[number];

function isNotifiableEventType(type: string): type is NotifiableEventType {
  return (NOTIFIABLE_EVENT_TYPES as readonly string[]).includes(type);
}

const EVENT_TYPE_LABEL: Record<NotifiableEventType, string> = {
  assignment: '課題',
  test:       'テスト',
  report:     'レポート',
};

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

/**
 * 指定した年・月の最終日を返す
 * 例: lastDayOf(2024, 1) → 29（うるう年の2月）
 */
function lastDayOf(year: number, month: number): number {
  // new Date(year, month+1, 0) で翌月0日 = 当月末日
  return new Date(year, month + 1, 0).getDate();
}

/**
 * renewal_day から次回更新日を返す
 * 29〜31日が存在しない月（2月など）は月末にクランプする
 * 例: renewalDay=31, 2月 → 2/28 or 2/29
 */
export function getNextRenewalDate(renewalDay: number): Date {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth();

  // 今月の有効な更新日（月末クランプ）
  const effectiveThisMonth = Math.min(renewalDay, lastDayOf(y, m));
  const thisMonth = new Date(y, m, effectiveThisMonth);

  if (thisMonth > now) return thisMonth;

  // 来月の有効な更新日（月末クランプ）
  const nextM    = m + 1;
  const nextY    = nextM > 11 ? y + 1 : y;
  const nextMIdx = nextM > 11 ? 0 : nextM;
  const effectiveNextMonth = Math.min(renewalDay, lastDayOf(nextY, nextMIdx));
  return new Date(nextY, nextMIdx, effectiveNextMonth);
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

// ═══════════════════════════════════════════════════════════
// イベント通知（課題・テスト・レポート）
// ═══════════════════════════════════════════════════════════

/**
 * 課題・テスト・レポートの締切通知を登録する。
 * - 3日前 09:00
 * - 前日  09:00
 * - 当日  09:00
 * 対象でないイベントタイプは何もしない。
 */
export async function scheduleEventNotifications(event: AppEvent): Promise<void> {
  if (!isNotifiableEventType(event.event_type)) return;
  if (!event.start_date) return;
  const N = getNotifications();
  if (!N) return;

  const label = EVENT_TYPE_LABEL[event.event_type as NotifiableEventType];
  // start_date を当日 09:00 の Date に変換（ローカルタイム）
  const due = new Date(`${event.start_date}T09:00:00`);
  const now = new Date();

  const triggers = [
    {
      id:    `ev_${event.id}_3d`,
      title: `📚 ${label}の締切3日前`,
      body:  `「${event.title}」の締切まであと3日です`,
      offset: -3,
    },
    {
      id:    `ev_${event.id}_1d`,
      title: `⚠️ ${label}の締切は明日`,
      body:  `「${event.title}」の締切は明日です！`,
      offset: -1,
    },
    {
      id:    `ev_${event.id}_0d`,
      title: `🔥 ${label}の締切は今日`,
      body:  `「${event.title}」の締切は今日です！`,
      offset:  0,
    },
  ];

  for (const t of triggers) {
    const date = new Date(due);
    date.setDate(date.getDate() + t.offset);
    if (date <= now) continue; // 過去の日時はスキップ
    try {
      await N.scheduleNotificationAsync({
        identifier: t.id,
        content:    { title: t.title, body: t.body, sound: true },
        trigger:    { type: N.SchedulableTriggerInputTypes.DATE, date },
      });
    } catch { /* ignore */ }
  }
}

/** イベントに紐づく通知を全てキャンセルする */
export async function cancelEventNotifications(id: string): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await Promise.all([
      N.cancelScheduledNotificationAsync(`ev_${id}_3d`),
      N.cancelScheduledNotificationAsync(`ev_${id}_1d`),
      N.cancelScheduledNotificationAsync(`ev_${id}_0d`),
    ]);
  } catch { /* ignore */ }
}

/**
 * 全イベントの通知を一括再スケジュールする。
 * fetch() 後に呼ぶことで、古い通知（削除済み・日付変更済み）を
 * クリーンアップしつつ最新状態に同期する。
 */
export async function rescheduleAllEventNotifications(events: AppEvent[]): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    // ev_ プレフィックスの通知を全てキャンセル
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith('ev_'))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );
    // 未完了・対象タイプのイベントだけ再スケジュール
    for (const ev of events) {
      if (!ev.is_done && isNotifiableEventType(ev.event_type)) {
        await scheduleEventNotifications(ev);
      }
    }
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
// シフト通知（バイト開始前リマインダー）
// ═══════════════════════════════════════════════════════════

/** シフト通知に必要な最小限の情報 */
interface ShiftNotificationParams {
  id:             string;
  date:           string;        // YYYY-MM-DD
  start_time:     string;        // HH:MM
  workplace_name?: string | null;
}

/**
 * バイト開始30分前の通知を登録する。
 * 既に30分前を過ぎているシフトは何もしない。
 */
export async function scheduleShiftNotification(
  shift: ShiftNotificationParams,
): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;

    const shiftStart  = new Date(`${shift.date}T${shift.start_time}:00`);
    const triggerDate = new Date(shiftStart.getTime() - 30 * 60 * 1000);
    if (triggerDate <= new Date()) return;

    const name = shift.workplace_name ?? 'バイト';
    await N.scheduleNotificationAsync({
      identifier: `shift_${shift.id}_pre`,
      content: {
        title: '💼 バイト開始30分前',
        body:  `${name}のバイトが30分後に始まります（${shift.start_time}〜）`,
        sound: true,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  } catch { /* ignore */ }
}

/** シフトに紐づく通知をキャンセルする */
export async function cancelShiftNotification(id: string): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.cancelScheduledNotificationAsync(`shift_${id}_pre`);
  } catch { /* ignore */ }
}

/**
 * 全シフトの通知を一括再スケジュールする。
 * fetch() 後に呼ぶことで、削除済みシフトの通知もクリーンアップされる。
 */
export async function rescheduleAllShiftNotifications(
  shifts: ShiftNotificationParams[],
): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    // shift_ プレフィックスの通知を全てキャンセル
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith('shift_'))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );
    // 未来のシフトを再スケジュール
    for (const shift of shifts) {
      await scheduleShiftNotification(shift);
    }
  } catch { /* ignore */ }
}
