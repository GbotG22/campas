import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  shifts:        'campas_notif_shifts',
  subscriptions: 'campas_notif_subscriptions',
  events:        'campas_notif_events',
  payday:        'campas_notif_payday',
} as const;

export type NotificationCategory = keyof typeof KEYS;

export interface NotificationSettings {
  shifts:        boolean;
  subscriptions: boolean;
  events:        boolean;
  payday:        boolean;
}

/** 全カテゴリの通知設定を取得する。未設定（初回）はすべて true */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const [s, sub, ev, pay] = await AsyncStorage.multiGet([
      KEYS.shifts, KEYS.subscriptions, KEYS.events, KEYS.payday,
    ]);
    return {
      shifts:        s[1]   !== 'false',
      subscriptions: sub[1] !== 'false',
      events:        ev[1]  !== 'false',
      payday:        pay[1] !== 'false',
    };
  } catch {
    return { shifts: true, subscriptions: true, events: true, payday: true };
  }
}

/** 単一カテゴリの通知設定を保存する */
export async function setNotificationSetting(
  category: NotificationCategory,
  value: boolean,
): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS[category], String(value));
  } catch { /* ignore */ }
}
