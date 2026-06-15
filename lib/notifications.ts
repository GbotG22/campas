/**
 * 通知ヘルパー
 * expo-notifications を遅延 require() で読み込み、
 * Expo Go で native module が利用できない場合でもクラッシュしないようにする
 */
import type { Database } from '@/types/database';
import { getDetailedNotificationSettings, MinuteOption } from '@/lib/notificationSettings';
import { supabase } from '@/lib/supabase';
import { localYMD } from '@/lib/dateUtils';
import { DEFAULT_CONFIG } from '@/hooks/usePeriodSettings';

type Assignment     = Database['public']['Tables']['assignments']['Row'];
type Subscription   = Database['public']['Tables']['subscriptions']['Row'];
type AppEvent       = Database['public']['Tables']['events']['Row'];
type ShiftRow       = Database['public']['Tables']['shifts']['Row'];
type Workplace      = Database['public']['Tables']['workplaces']['Row'];
type FixedExpense   = Database['public']['Tables']['fixed_expenses']['Row'];
type TimetableSlot  = Database['public']['Tables']['timetable_slots']['Row'];

interface PeriodTime   { period: number; start: string; end: string; }
interface PeriodConfig { periods: PeriodTime[]; }

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

// ── 権限確認（リクエストなし） ────────────────────────────
async function hasNotificationPermission(): Promise<boolean> {
  try {
    const N = getNotifications();
    if (!N) return false;
    const { status } = await N.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
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
  const settings = await getDetailedNotificationSettings();
  const N = getNotifications();
  if (!N) return;

  const due = new Date(`${a.due_date}T09:00:00`); // ローカル9時として解釈（UTC解釈を避ける）
  const now = new Date();

  const triggers = [
    { id: `${a.id}_3d`, title: '📚 課題の締切3日前', body: `「${a.title}」の締切まであと3日です`, offset: -3, enabled: settings.events3d },
    { id: `${a.id}_1d`, title: '⚠️ 課題の締切は明日', body: `「${a.title}」の締切は明日です！`,  offset: -1, enabled: settings.events1d },
    { id: `${a.id}_0d`, title: '🔥 課題の締切は今日', body: `「${a.title}」の締切は今日です！`,  offset:  0, enabled: settings.events0d },
  ];

  for (const t of triggers) {
    if (!t.enabled) continue;
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

const KNOWN_PREFIXES = ['ev_', 'shift_', 'sub_', 'fixed_', 'payday_', 'class_'];

export async function rescheduleAllNotifications(assignments: Assignment[]) {
  try {
    if (!await hasNotificationPermission()) return;
    const N = getNotifications();
    if (!N) return;
    const scheduled = await N.getAllScheduledNotificationsAsync();
    // 課題通知のidentifierはprefix無しのUUID形式。他の通知のprefixに合致しないものが課題通知
    await Promise.all(
      scheduled
        .filter(n => !KNOWN_PREFIXES.some(p => n.identifier.startsWith(p)))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );
    for (const a of assignments) {
      if (a.status !== 'done') await scheduleAssignmentNotifications(a);
    }
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
// サブスク通知
// ═══════════════════════════════════════════════════════════

function lastDayOf(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getNextRenewalDate(renewalDay: number): Date {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth();

  const effectiveThisMonth = Math.min(renewalDay, lastDayOf(y, m));
  const thisMonth = new Date(y, m, effectiveThisMonth);

  if (thisMonth > now) return thisMonth;

  const nextM    = m + 1;
  const nextY    = nextM > 11 ? y + 1 : y;
  const nextMIdx = nextM > 11 ? 0 : nextM;
  const effectiveNextMonth = Math.min(renewalDay, lastDayOf(nextY, nextMIdx));
  return new Date(nextY, nextMIdx, effectiveNextMonth);
}

export function daysUntilRenewal(renewalDay: number): number {
  const next = getNextRenewalDate(renewalDay);
  return Math.ceil((next.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export async function scheduleSubscriptionNotification(sub: Subscription) {
  try {
    const settings = await getDetailedNotificationSettings();
    const N = getNotifications();
    if (!N) return;
    const next = getNextRenewalDate(sub.renewal_day);
    const now  = new Date();

    const triggers = [
      { id: `sub_${sub.id}_7d`, days: 7, enabled: settings.sub7d,  label: '7日後に更新されます' },
      { id: `sub_${sub.id}_3d`, days: 3, enabled: settings.sub3d,  label: '3日後に更新されます' },
      { id: `sub_${sub.id}_1d`, days: 1, enabled: settings.sub1d,  label: '明日更新されます' },
    ];

    for (const t of triggers) {
      if (!t.enabled) continue;
      const triggerDate = new Date(next);
      triggerDate.setDate(triggerDate.getDate() - t.days);
      triggerDate.setHours(9, 0, 0, 0);
      if (triggerDate <= now) continue;
      try {
        await N.scheduleNotificationAsync({
          identifier: t.id,
          content: {
            title: '🔔 サブスク更新のお知らせ',
            body:  `${sub.service_name}が${t.label}`,
            sound: true,
            categoryIdentifier: SUBSCRIPTION_CATEGORY,
            data: { subscriptionId: sub.id, type: 'renewal' },
          },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate },
        });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export async function cancelSubscriptionNotifications(id: string) {
  try {
    const N = getNotifications();
    if (!N) return;
    await Promise.all([
      N.cancelScheduledNotificationAsync(`sub_${id}_7d`),
      N.cancelScheduledNotificationAsync(`sub_${id}_3d`),
      N.cancelScheduledNotificationAsync(`sub_${id}_1d`),
    ]);
  } catch { /* ignore */ }
}

export async function rescheduleSubscriptionNotifications(
  subscriptions: Subscription[],
) {
  try {
    if (!await hasNotificationPermission()) return;
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
    }
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
// イベント通知（課題・テスト・レポート）
// ═══════════════════════════════════════════════════════════

export async function scheduleEventNotifications(event: AppEvent): Promise<void> {
  if (!isNotifiableEventType(event.event_type)) return;
  if (!event.start_date) return;
  const settings = await getDetailedNotificationSettings();
  const N = getNotifications();
  if (!N) return;

  const label = EVENT_TYPE_LABEL[event.event_type as NotifiableEventType];
  const due = new Date(`${event.start_date}T09:00:00`);
  const now = new Date();

  const triggers = [
    {
      id:      `ev_${event.id}_3d`,
      title:   `📚 ${label}の締切3日前`,
      body:    `「${event.title}」の締切まであと3日です`,
      offset:  -3,
      enabled: settings.events3d,
    },
    {
      id:      `ev_${event.id}_1d`,
      title:   `⚠️ ${label}の締切は明日`,
      body:    `「${event.title}」の締切は明日です！`,
      offset:  -1,
      enabled: settings.events1d,
    },
    {
      id:      `ev_${event.id}_0d`,
      title:   `🔥 ${label}の締切は今日`,
      body:    `「${event.title}」の締切は今日です！`,
      offset:   0,
      enabled: settings.events0d,
    },
  ];

  for (const t of triggers) {
    if (!t.enabled) continue;
    const date = new Date(due);
    date.setDate(date.getDate() + t.offset);
    if (date <= now) continue;
    try {
      await N.scheduleNotificationAsync({
        identifier: t.id,
        content:    { title: t.title, body: t.body, sound: true },
        trigger:    { type: N.SchedulableTriggerInputTypes.DATE, date },
      });
    } catch { /* ignore */ }
  }
}

export async function cancelEventNotifications(id: string): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await Promise.all([
      N.cancelScheduledNotificationAsync(`ev_${id}_3d`),
      N.cancelScheduledNotificationAsync(`ev_${id}_1d`),
      N.cancelScheduledNotificationAsync(`ev_${id}_0d`),
      N.cancelScheduledNotificationAsync(`ev_${id}_custom`),
    ]);
  } catch { /* ignore */ }
}

// ── 予定ごとの個別通知（ユーザーが予定単位で設定） ──────────────

/** 「30分前」「1時間前」「1日前」等のラベル */
export function minutesBeforeLabel(min: number): string {
  if (min === 0)    return '時刻通り';
  if (min === 1440) return '1日前';
  if (min >= 60)    return `${min / 60}時間前`;
  return `${min}分前`;
}

/**
 * 予定単位の通知を予約する。
 * notification_enabled = false の予定は何もしない。
 * 終日予定（start_time なし）は 09:00 を基準時刻とする。
 */
export async function scheduleCustomEventNotification(event: AppEvent): Promise<void> {
  try {
    if (!event.notification_enabled || event.is_done) return;
    const N = getNotifications();
    if (!N) return;

    const baseTime    = event.start_time ?? '09:00';
    const start       = new Date(`${event.start_date}T${baseTime}:00`);
    const min         = event.notification_minutes_before ?? 0;
    const triggerDate = new Date(start.getTime() - min * 60 * 1000);
    if (triggerDate <= new Date()) return;

    const title = min === 0
      ? `⏰ 予定の時間です`
      : `⏰ ${minutesBeforeLabel(min)}のお知らせ`;
    await N.scheduleNotificationAsync({
      identifier: `ev_${event.id}_custom`,
      content: {
        title,
        body:  `${baseTime}から「${event.title}」の予定があります`,
        sound: true,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  } catch { /* ignore */ }
}

export async function rescheduleAllEventNotifications(events: AppEvent[]): Promise<void> {
  try {
    if (!await hasNotificationPermission()) return;
    const N = getNotifications();
    if (!N) return;
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith('ev_'))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );
    for (const ev of events) {
      if (!ev.is_done && isNotifiableEventType(ev.event_type)) {
        await scheduleEventNotifications(ev);
      }
      await scheduleCustomEventNotification(ev);
    }
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
// シフト通知（バイト開始前リマインダー）
// ═══════════════════════════════════════════════════════════

interface ShiftNotificationParams {
  id:              string;
  date:            string;        // YYYY-MM-DD
  start_time:      string;        // HH:MM
  workplace_name?: string | null;
  /** シフト個別の通知設定（未指定なら全体設定のみ） */
  notification_enabled?:        boolean;
  notification_minutes_before?: number;
}

export async function scheduleShiftNotification(
  shift: ShiftNotificationParams,
): Promise<void> {
  try {
    const settings = await getDetailedNotificationSettings();
    if (settings.shiftMinutes === 0) return;
    const N = getNotifications();
    if (!N) return;

    const shiftStart  = new Date(`${shift.date}T${shift.start_time}:00`);
    const triggerDate = new Date(shiftStart.getTime() - settings.shiftMinutes * 60 * 1000);
    if (triggerDate <= new Date()) return;

    const name  = shift.workplace_name ?? 'バイト';
    const label = settings.shiftMinutes >= 60
      ? `${settings.shiftMinutes / 60}時間`
      : `${settings.shiftMinutes}分`;

    await N.scheduleNotificationAsync({
      identifier: `shift_${shift.id}_pre`,
      content: {
        title: `💼 バイト開始${label}前`,
        body:  `${name}のバイトが${label}後に始まります（${shift.start_time}〜）`,
        sound: true,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  } catch { /* ignore */ }
}

/** シフト個別の通知（シフト単位で「何分前」を設定したもの） */
export async function scheduleCustomShiftNotification(
  shift: ShiftNotificationParams,
): Promise<void> {
  try {
    if (!shift.notification_enabled) return;
    const N = getNotifications();
    if (!N) return;

    const start       = new Date(`${shift.date}T${shift.start_time}:00`);
    const min         = shift.notification_minutes_before ?? 0;
    const triggerDate = new Date(start.getTime() - min * 60 * 1000);
    if (triggerDate <= new Date()) return;

    const name  = shift.workplace_name ?? 'バイト';
    const title = min === 0
      ? `💼 バイトの時間です`
      : `💼 バイト${minutesBeforeLabel(min)}のお知らせ`;
    await N.scheduleNotificationAsync({
      identifier: `shift_${shift.id}_custom`,
      content: {
        title,
        body:  `${shift.start_time}から「${name}」の予定があります`,
        sound: true,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  } catch { /* ignore */ }
}

export async function cancelShiftNotification(id: string): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await Promise.all([
      N.cancelScheduledNotificationAsync(`shift_${id}_pre`),
      N.cancelScheduledNotificationAsync(`shift_${id}_custom`),
    ]);
  } catch { /* ignore */ }
}

export async function rescheduleAllShiftNotifications(
  shifts: ShiftNotificationParams[],
): Promise<void> {
  try {
    if (!await hasNotificationPermission()) return;
    const N = getNotifications();
    if (!N) return;
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith('shift_'))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );
    for (const shift of shifts) {
      await scheduleShiftNotification(shift);
      await scheduleCustomShiftNotification(shift);
    }
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
// 給料日通知
// ═══════════════════════════════════════════════════════════

function getNextPayday(paydayDay: number, monthOffset: number): Date {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth();

  const targetM    = m + monthOffset;
  const targetY    = y + Math.floor(targetM / 12);
  const targetMIdx = ((targetM % 12) + 12) % 12;

  const daysInMonth  = new Date(targetY, targetMIdx + 1, 0).getDate();
  const effectiveDay = Math.min(paydayDay, daysInMonth);
  const candidate    = new Date(targetY, targetMIdx, effectiveDay, 9, 0, 0, 0);

  if (candidate > now) return candidate;

  const nextM    = targetMIdx + 1;
  const nextY    = targetY + Math.floor(nextM / 12);
  const nextMIdx = nextM % 12;
  const daysInNext       = new Date(nextY, nextMIdx + 1, 0).getDate();
  const effectiveDayNext = Math.min(paydayDay, daysInNext);
  return new Date(nextY, nextMIdx, effectiveDayNext, 9, 0, 0, 0);
}

export async function schedulePaydayNotification(workplace: Workplace): Promise<void> {
  try {
    const settings = await getDetailedNotificationSettings();
    const N = getNotifications();
    if (!N) return;

    const payday = getNextPayday(workplace.payday_day, workplace.payday_month_offset);
    const now    = new Date();

    const triggers = [
      { id: `payday_${workplace.id}_3d`, days: 3, enabled: settings.payday3d, title: '💰 給料日まであと3日', body: `${workplace.name}の給料日まであと3日です` },
      { id: `payday_${workplace.id}_1d`, days: 1, enabled: settings.payday1d, title: '💰 給料日は明日',     body: `${workplace.name}の給料日は明日です` },
      { id: `payday_${workplace.id}_0d`, days: 0, enabled: settings.payday0d, title: '💰 本日は給料日です', body: `${workplace.name}の給料日です` },
    ];

    for (const t of triggers) {
      if (!t.enabled) continue;
      const triggerDate = new Date(payday);
      triggerDate.setDate(triggerDate.getDate() - t.days);
      triggerDate.setHours(9, 0, 0, 0);
      if (triggerDate <= now) continue;
      try {
        await N.scheduleNotificationAsync({
          identifier: t.id,
          content: { title: t.title, body: t.body, sound: true },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate },
        });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export async function cancelPaydayNotification(id: string): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await Promise.all([
      N.cancelScheduledNotificationAsync(`payday_${id}_3d`),
      N.cancelScheduledNotificationAsync(`payday_${id}_1d`),
      N.cancelScheduledNotificationAsync(`payday_${id}_0d`),
    ]);
  } catch { /* ignore */ }
}

export async function rescheduleAllPaydayNotifications(workplaces: Workplace[]): Promise<void> {
  try {
    if (!await hasNotificationPermission()) return;
    const N = getNotifications();
    if (!N) return;
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith('payday_'))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );
    for (const wp of workplaces) {
      if (wp.is_active) await schedulePaydayNotification(wp);
    }
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
// 固定費通知（支払日前日）
// ═══════════════════════════════════════════════════════════

function getNextFixedPaymentDate(paymentDay: number, today: Date = new Date()): Date {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const lastDayThis = new Date(y, m + 1, 0).getDate();
  const actualDay   = Math.min(paymentDay, lastDayThis);
  if (d <= actualDay) return new Date(y, m, actualDay);
  const nextM = m + 1;
  return new Date(y, nextM, Math.min(paymentDay, new Date(y, nextM + 1, 0).getDate()));
}

export async function scheduleFixedExpenseNotification(fe: FixedExpense): Promise<void> {
  try {
    const settings = await getDetailedNotificationSettings();
    const N = getNotifications();
    if (!N || !settings.fixed1d) return;

    const next = getNextFixedPaymentDate(fe.payment_day);
    const triggerDate = new Date(next);
    triggerDate.setDate(triggerDate.getDate() - 1);
    triggerDate.setHours(9, 0, 0, 0);
    if (triggerDate <= new Date()) return;

    await N.scheduleNotificationAsync({
      identifier: `fixed_${fe.id}_1d`,
      content: {
        title: '🏠 固定費の支払い明日です',
        body:  `${fe.name}の支払日は明日です`,
        sound: true,
        data:  { fixedExpenseId: fe.id, type: 'fixed_payment' },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  } catch { /* ignore */ }
}

export async function cancelFixedExpenseNotification(id: string): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.cancelScheduledNotificationAsync(`fixed_${id}_1d`);
  } catch { /* ignore */ }
}

export async function rescheduleAllFixedExpenseNotifications(fixedExpenses: FixedExpense[]): Promise<void> {
  try {
    if (!await hasNotificationPermission()) return;
    const N = getNotifications();
    if (!N) return;
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith('fixed_'))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );
    for (const fe of fixedExpenses) {
      if (fe.is_active) await scheduleFixedExpenseNotification(fe);
    }
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
// 授業通知（個別DATE方式）
//
// 旧方式は WEEKLY 繰り返し1本（class_${slotId}）だったが、休講日の
// 個別抑制ができないため、各回を個別の DATE 通知として予約する。
//   identifier: class_${slotId}_${YYYYMMDD}
// 予約数は CLASS_BUDGET 件を上限とし、スロット数から動的に
// 予約週数（1〜4週）を決める。休講日（class_events.cancel）はスキップする。
// ═══════════════════════════════════════════════════════════

/** 授業通知に割り当てる予約数の上限（iOS全体64件のうち授業分の目安） */
const CLASS_BUDGET = 40;
const MAX_WEEKS    = 4;

/** Date → "YYYYMMDD"（identifier 用） */
function ymdCompact(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** app day_of_week(0=Mon..4=Fri) の、from 以降で最も近い日付（時刻0:00） */
function nextDateForAppDay(appDay: number, from: Date): Date | null {
  const jsDay = appDay + 1; // 0(Mon)->1(Mon as JS), ... 4(Fri)->5
  if (jsDay < 1 || jsDay > 5) return null;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const diff = (jsDay - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * 単一の授業回（指定日）の通知を予約する。
 * 過去・時限未設定・通知オフのときは何もせず false を返す。
 */
export async function scheduleClassOccurrence(
  slot: TimetableSlot,
  periodConfig: PeriodConfig,
  classMinutes: MinuteOption,
  date: Date,
): Promise<boolean> {
  if (classMinutes === 0) return false;
  const N = getNotifications();
  if (!N) return false;

  const pt = periodConfig.periods.find(p => p.period === slot.period);
  if (!pt?.start) return false;

  const [hStr, mStr] = pt.start.split(':');
  const trigger = new Date(date);
  trigger.setHours(parseInt(hStr, 10), parseInt(mStr, 10), 0, 0);
  trigger.setMinutes(trigger.getMinutes() - classMinutes);
  if (trigger <= new Date()) return false; // 過去はスキップ

  const minuteLabel = classMinutes >= 60 ? `${classMinutes / 60}時間` : `${classMinutes}分`;
  const endStr = pt.end ?? '';

  try {
    await N.scheduleNotificationAsync({
      identifier: `class_${slot.id}_${ymdCompact(date)}`,
      content: {
        title: `授業開始${minuteLabel}前`,
        body:  `${slot.subject_name}\n${slot.period}限（${pt.start}〜${endStr}）\n\n${minuteLabel}後に開始します`,
        sound: true,
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: trigger },
    });
    return true;
  } catch {
    return false;
  }
}

/** 指定スロット・指定日（YYYY-MM-DD）の授業通知を1件だけキャンセル（休講登録時） */
export async function cancelClassOccurrence(slotId: string, dateYMD: string): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    const compact = dateYMD.replace(/-/g, '');
    await N.cancelScheduledNotificationAsync(`class_${slotId}_${compact}`);
  } catch { /* ignore */ }
}

/** 指定スロットの授業通知を全回キャンセル（スロット削除・通知オフ時） */
export async function cancelClassNotification(slotId: string): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith(`class_${slotId}`))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch { /* ignore */ }
}

/** 指定スロット群の「今日以降の休講日」集合（key = `${slotId}_${YYYY-MM-DD}`）を取得 */
async function fetchCancelledClassDates(slotIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (slotIds.length === 0) return set;
  try {
    const { data } = await supabase
      .from('class_events')
      .select('slot_id,date,event_type')
      .in('slot_id', slotIds)
      .eq('event_type', 'cancel')
      .gte('date', localYMD(new Date()));
    data?.forEach(e => set.add(`${e.slot_id}_${e.date}`));
  } catch { /* ignore */ }
  return set;
}

/**
 * 授業通知を全再予約する（個別DATE方式）。
 * - 既存の class_ 通知（旧WEEKLY含む）を全削除してから再予約 → 旧方式から自動移行
 * - スロット数から予約週数を算出（CLASS_BUDGET 件以内）
 * - 休講日（class_events.cancel）はスキップ
 * - slots は呼び出し側でアクティブ学期に絞って渡すこと
 */
export async function rescheduleAllClassNotifications(
  slots: TimetableSlot[],
  periodConfig: PeriodConfig,
): Promise<void> {
  try {
    if (!await hasNotificationPermission()) return;
    const N = getNotifications();
    if (!N) return;

    // 旧WEEKLY含む既存の授業通知を一括削除（二重通知防止・移行）
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith('class_'))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );

    const settings = await getDetailedNotificationSettings();
    if (settings.classMinutes === 0 || slots.length === 0) return;

    const cancelled = await fetchCancelledClassDates(slots.map(s => s.id));

    // 予約週数 = floor(予算 / スロット数) を 1〜MAX_WEEKS にクランプ
    const weeks = Math.max(1, Math.min(MAX_WEEKS, Math.floor(CLASS_BUDGET / slots.length)));

    // 近い週から全スロットを埋める（予算超過時は近い日付を優先）
    let count = 0;
    for (let w = 0; w < weeks && count < CLASS_BUDGET; w++) {
      for (const slot of slots) {
        if (count >= CLASS_BUDGET) break;
        const base = nextDateForAppDay(slot.day_of_week, new Date());
        if (!base) continue;
        const date = new Date(base);
        date.setDate(date.getDate() + 7 * w);
        if (cancelled.has(`${slot.id}_${localYMD(date)}`)) continue;
        const ok = await scheduleClassOccurrence(slot, periodConfig, settings.classMinutes, date);
        if (ok) count++;
      }
    }
  } catch { /* ignore */ }
}

/**
 * DBからアクティブ学期のスロット・時限設定を取得して授業通知を再予約する。
 * アプリ起動/復帰時の補充用（フック非依存で呼べる）。
 */
export async function refreshClassNotificationsFromDB(): Promise<void> {
  try {
    if (!await hasNotificationPermission()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 学期（アクティブ判定）
    const { data: sems } = await supabase
      .from('semesters')
      .select('id,is_active')
      .eq('user_id', user.id);
    const hasSemesters = (sems?.length ?? 0) > 0;
    const active = sems?.find(s => s.is_active);

    // スロット（学期があればアクティブ学期のみ／無ければ全件＝従来挙動）
    let q = supabase.from('timetable_slots').select('*').eq('user_id', user.id);
    if (hasSemesters) {
      q = active ? q.eq('semester_id', active.id) : q.is('semester_id', null);
    }
    const { data: slots } = await q;

    // 時限設定
    const { data: ps } = await supabase
      .from('period_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();
    const periodConfig: PeriodConfig = ps
      ? { periods: ps.periods as unknown as PeriodTime[] }
      : { periods: DEFAULT_CONFIG.periods };

    await rescheduleAllClassNotifications(slots ?? [], periodConfig);
  } catch { /* ignore */ }
}
