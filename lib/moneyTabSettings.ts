import AsyncStorage from '@react-native-async-storage/async-storage';

const MONEY_TABS_KEY = 'campas_money_tabs';

export type MoneyTabKey = 'expenses' | 'subscriptions' | 'incomes' | 'salary' | 'cards' | 'fixed_expenses';

export type MoneyTabDef = {
  key: MoneyTabKey;
  label: string;
  required?: boolean;   // true = 削除不可
  disabled?: boolean;   // true = ON/OFF 操作不可（準備中など）
};

export const ALL_MONEY_TABS: MoneyTabDef[] = [
  { key: 'expenses',       label: '支出',   required: true },
  { key: 'subscriptions',  label: 'サブスク' },
  { key: 'incomes',        label: '収入' },
  { key: 'salary',         label: '給料' },
  { key: 'cards',          label: 'カード' },
  { key: 'fixed_expenses', label: '固定費', disabled: true },
];

const DEFAULT_ENABLED: Record<MoneyTabKey, boolean> = {
  expenses:       true,
  subscriptions:  true,
  incomes:        true,
  salary:         true,
  cards:          false,
  fixed_expenses: false,
};

export async function loadMoneyTabSettings(): Promise<Record<MoneyTabKey, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(MONEY_TABS_KEY);
    if (!raw) return { ...DEFAULT_ENABLED };
    const parsed = JSON.parse(raw) as Partial<Record<MoneyTabKey, boolean>>;
    // 既存設定にデフォルト値をマージ（新タブが追加されても壊れない）
    return { ...DEFAULT_ENABLED, ...parsed };
  } catch {
    return { ...DEFAULT_ENABLED };
  }
}

export async function saveMoneyTabSettings(settings: Record<MoneyTabKey, boolean>): Promise<void> {
  // required タブは常に true を強制
  const safe = { ...settings };
  for (const tab of ALL_MONEY_TABS) {
    if (tab.required) safe[tab.key] = true;
  }
  await AsyncStorage.setItem(MONEY_TABS_KEY, JSON.stringify(safe));
}
