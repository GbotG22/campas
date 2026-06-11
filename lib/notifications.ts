/**
 * 通知ヘルパー
 * expo-notifications を遅延 require() で読み込み、
 * Expo Go で native module が利用できない場合でもクラッシュしないようにする
 */
import type { Database } from '@/types/database';
import { getDetailedNotificationSettings, MinuteOption } from '@/lib/notificationSettings';

type Assignment     = Database['public']['Tables']['assignments']['Row'];
type Subscription   = Database['public']['Tables']['subscriptions']['Row'];
type AppEvent       = Database['public']['Tables']['events']['Row'];
type ShiftRow       = Database['public']['Tables']['shifts']['Row'];
type Workplace      = Database['public']['Tables']['workplaces']['Row'];
type FixedExpense   = Database['public']['Tables']['fixed_expenses']['Row'];
type TimetableSlot  = Database['public']['Tables']['timetable_slots']['Row'];

interface PeriodTime   { period: number; start: string; end: string; }
interface PeriodConfig { periods: PeriodTime[]; }

// app day_of_week (0=Mon...4=Fri) → expo weekday (1=Sun, 2=Mon...7=Sat)
const APP_DAY_TO_EXPO_WEEKDAY: Record<number, number> = { 0: 2, 1: 3, 2: 4, 3: 5, 4: 6 };

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
    ]);
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

export async function cancelShiftNotification(id: string): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.cancelScheduledNotificationAsync(`shift_${id}_pre`);
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
// 授業通知（毎週繰り返し）
// ═══════════════════════════════════════════════════════════

export async function scheduleClassNotification(
  slot: TimetableSlot,
  periodConfig: PeriodConfig,
  classMinutes: MinuteOption,
): Promise<void> {
  if (classMinutes === 0) return;
  const N = getNotifications();
  if (!N) return;

  const pt = periodConfig.periods.find(p => p.period === slot.period);
  if (!pt?.start) return;

  const weekday = APP_DAY_TO_EXPO_WEEKDAY[slot.day_of_week];
  if (!weekday) return;

  const [hStr, mStr] = pt.start.split(':');
  const totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) - classMinutes;
  if (totalMinutes < 0) return;

  const hour   = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const minuteLabel = classMinutes >= 60 ? `${classMinutes / 60}時間` : `${classMinutes}分`;
  const endStr = pt.end ?? '';

  try {
    await N.scheduleNotificationAsync({
      identifier: `class_${slot.id}`,
      content: {
        title: `授業開始${minuteLabel}前`,
        body:  `${slot.subject_name}\n${slot.period}限（${pt.start}〜${endStr}）\n\n${minuteLabel}後に開始します`,
        sound: true,
      },
      trigger: {
        type:    N.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
      },
    });
  } catch { /* ignore */ }
}

export async function cancelClassNotification(id: string): Promise<void> {
  try {
    const N = getNotifications();
    if (!N) return;
    await N.cancelScheduledNotificationAsync(`class_${id}`);
  } catch { /* ignore */ }
}

export async function rescheduleAllClassNotifications(
  slots: TimetableSlot[],
  periodConfig: PeriodConfig,
): Promise<void> {
  try {
    if (!await hasNotificationPermission()) return;
    const N = getNotifications();
    if (!N) return;
    const settings = await getDetailedNotificationSettings();
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(n => n.identifier.startsWith('class_'))
        .map(n => N.cancelScheduledNotificationAsync(n.identifier)),
    );
    if (settings.classMinutes === 0) return;
    for (const slot of slots) {
      await scheduleClassNotification(slot, periodConfig, settings.classMinutes);
    }
  } catch { /* ignore */ }
}
