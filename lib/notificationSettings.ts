import AsyncStorage from '@react-native-async-storage/async-storage';

// ── 既存キー（後方互換のため残す） ────────────────────────────
const LEGACY_KEYS = {
  shifts:        'campas_notif_shifts',
  subscriptions: 'campas_notif_subscriptions',
  events:        'campas_notif_events',
  payday:        'campas_notif_payday',
} as const;

// ── 詳細設定キー ──────────────────────────────────────────────
const DETAIL_KEYS = {
  shiftMinutes:  'campas_notif_shift_minutes',
  classMinutes:  'campas_notif_class_minutes',
  events3d:      'campas_notif_events_3d',
  events1d:      'campas_notif_events_1d',
  events0d:      'campas_notif_events_0d',
  payday3d:      'campas_notif_payday_3d',
  payday1d:      'campas_notif_payday_1d',
  payday0d:      'campas_notif_payday_0d',
  sub7d:         'campas_notif_sub_7d',
  sub3d:         'campas_notif_sub_3d',
  sub1d:         'campas_notif_sub_1d',
  fixed1d:       'campas_notif_fixed_1d',
} as const;

// ── 型定義 ────────────────────────────────────────────────────

/** シフト・授業通知のタイミング（分）。0 = オフ */
export type MinuteOption = 0 | 15 | 30 | 60 | 120;

export interface DetailedNotificationSettings {
  shiftMinutes:  MinuteOption; // デフォルト 30
  classMinutes:  MinuteOption; // デフォルト 15（将来実装用、保存のみ）
  events3d:      boolean;      // デフォルト true
  events1d:      boolean;      // デフォルト true
  events0d:      boolean;      // デフォルト true
  payday3d:      boolean;      // デフォルト false
  payday1d:      boolean;      // デフォルト false
  payday0d:      boolean;      // デフォルト true
  sub7d:         boolean;      // デフォルト false
  sub3d:         boolean;      // デフォルト true
  sub1d:         boolean;      // デフォルト false
  fixed1d:       boolean;      // デフォルト true（固定費 前日通知）
}

export const DEFAULT_DETAILED_SETTINGS: DetailedNotificationSettings = {
  shiftMinutes: 30,
  classMinutes: 15,
  events3d:     true,
  events1d:     true,
  events0d:     true,
  payday3d:     false,
  payday1d:     false,
  payday0d:     true,
  sub7d:        false,
  sub3d:        true,
  sub1d:        false,
  fixed1d:      true,
};

// ── 後方互換用（既存コードから呼ばれる可能性があるため残す） ──

/** @deprecated DetailedNotificationSettings を使ってください */
export type NotificationCategory = keyof typeof LEGACY_KEYS;

/** @deprecated DetailedNotificationSettings を使ってください */
export interface NotificationSettings {
  shifts:        boolean;
  subscriptions: boolean;
  events:        boolean;
  payday:        boolean;
}

/** @deprecated getDetailedNotificationSettings を使ってください */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const settings = await getDetailedNotificationSettings();
    return {
      shifts:        settings.shiftMinutes > 0,
      subscriptions: settings.sub3d || settings.sub7d || settings.sub1d,
      events:        settings.events3d || settings.events1d || settings.events0d,
      payday:        settings.payday0d || settings.payday3d || settings.payday1d,
    };
  } catch {
    return { shifts: true, subscriptions: true, events: true, payday: true };
  }
}

/** @deprecated setDetailedNotificationSettings を使ってください */
export async function setNotificationSetting(
  _category: NotificationCategory,
  _value: boolean,
): Promise<void> { /* no-op: 詳細設定で管理 */ }

// ── 詳細設定の取得・保存 ──────────────────────────────────────

/** 詳細通知設定を取得する。未設定はデフォルト値 */
export async function getDetailedNotificationSettings(): Promise<DetailedNotificationSettings> {
  try {
    const keys = Object.values(DETAIL_KEYS);
    const pairs = await AsyncStorage.multiGet(keys);
    const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));

    const get = (key: string) => map[key];

    const parseMinute = (v: string | null | undefined, def: MinuteOption): MinuteOption => {
      const n = parseInt(v ?? '', 10);
      return ([0, 15, 30, 60, 120] as MinuteOption[]).includes(n as MinuteOption)
        ? (n as MinuteOption)
        : def;
    };
    const parseBool = (v: string | null | undefined, def: boolean): boolean =>
      v === null || v === undefined ? def : v !== 'false';

    return {
      shiftMinutes:  parseMinute(get(DETAIL_KEYS.shiftMinutes), DEFAULT_DETAILED_SETTINGS.shiftMinutes),
      classMinutes:  parseMinute(get(DETAIL_KEYS.classMinutes), DEFAULT_DETAILED_SETTINGS.classMinutes),
      events3d:      parseBool(get(DETAIL_KEYS.events3d), DEFAULT_DETAILED_SETTINGS.events3d),
      events1d:      parseBool(get(DETAIL_KEYS.events1d), DEFAULT_DETAILED_SETTINGS.events1d),
      events0d:      parseBool(get(DETAIL_KEYS.events0d), DEFAULT_DETAILED_SETTINGS.events0d),
      payday3d:      parseBool(get(DETAIL_KEYS.payday3d), DEFAULT_DETAILED_SETTINGS.payday3d),
      payday1d:      parseBool(get(DETAIL_KEYS.payday1d), DEFAULT_DETAILED_SETTINGS.payday1d),
      payday0d:      parseBool(get(DETAIL_KEYS.payday0d), DEFAULT_DETAILED_SETTINGS.payday0d),
      sub7d:         parseBool(get(DETAIL_KEYS.sub7d),    DEFAULT_DETAILED_SETTINGS.sub7d),
      sub3d:         parseBool(get(DETAIL_KEYS.sub3d),    DEFAULT_DETAILED_SETTINGS.sub3d),
      sub1d:         parseBool(get(DETAIL_KEYS.sub1d),    DEFAULT_DETAILED_SETTINGS.sub1d),
      fixed1d:       parseBool(get(DETAIL_KEYS.fixed1d),  DEFAULT_DETAILED_SETTINGS.fixed1d),
    };
  } catch {
    return { ...DEFAULT_DETAILED_SETTINGS };
  }
}

/** 詳細通知設定を一括保存する */
export async function saveDetailedNotificationSettings(
  s: DetailedNotificationSettings,
): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [DETAIL_KEYS.shiftMinutes, String(s.shiftMinutes)],
      [DETAIL_KEYS.classMinutes, String(s.classMinutes)],
      [DETAIL_KEYS.events3d,     String(s.events3d)],
      [DETAIL_KEYS.events1d,     String(s.events1d)],
      [DETAIL_KEYS.events0d,     String(s.events0d)],
      [DETAIL_KEYS.payday3d,     String(s.payday3d)],
      [DETAIL_KEYS.payday1d,     String(s.payday1d)],
      [DETAIL_KEYS.payday0d,     String(s.payday0d)],
      [DETAIL_KEYS.sub7d,        String(s.sub7d)],
      [DETAIL_KEYS.sub3d,        String(s.sub3d)],
      [DETAIL_KEYS.sub1d,        String(s.sub1d)],
      [DETAIL_KEYS.fixed1d,      String(s.fixed1d)],
    ]);
  } catch { /* ignore */ }
}
