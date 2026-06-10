import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import InlineDatePicker from '@/components/InlineDatePicker';
import InlineTimePicker from '@/components/InlineTimePicker';
import { COLORS, SPACING, RADIUS, SHADOW, SUBJECT_COLORS } from '@/constants/theme';
import { resolveServiceIcon } from '@/constants/serviceIcons';
import { useCreditCards, getClosingPeriod, getPaymentDate, CreditCard } from '@/hooks/useCreditCards';
import { useFixedExpenses, FIXED_EXPENSE_CATEGORIES, getCategoryDef, getNextPaymentDate, type FixedExpense, type FixedExpenseCategory } from '@/hooks/useFixedExpenses';
import { scheduleFixedExpenseNotification, cancelFixedExpenseNotification } from '@/lib/notifications';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes, INCOME_TYPE_CONFIG } from '@/hooks/useIncomes';
import { useShifts, calcWage, formatMinutes, calcWorkMinutes } from '@/hooks/useShifts';
import type { ShiftWithWorkplace } from '@/hooks/useShifts';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { useWorkplaces, WORKPLACE_COLORS } from '@/hooks/useWorkplaces';
import { daysUntilRenewal, getNextRenewalDate } from '@/lib/notifications';
import { getNextPayday } from '@/lib/payPeriod';
import { localYMD } from '@/lib/dateUtils';
import {
  ALL_MONEY_TABS, loadMoneyTabSettings, saveMoneyTabSettings,
  type MoneyTabKey,
} from '@/lib/moneyTabSettings';
import type { Database, IncomeType } from '@/types/database';
type Expense = Database['public']['Tables']['expenses']['Row'];

// ── ローカル型定義 ─────────────────────────────────────────
type Subscription = Database['public']['Tables']['subscriptions']['Row'];
type Workplace    = Database['public']['Tables']['workplaces']['Row'];
type SalaryRecordRow = Database['public']['Tables']['salary_records']['Row'];
interface SalaryRecord extends SalaryRecordRow {
  workplace?: { name: string; color: string } | null;
}

// ── 支出カテゴリ ───────────────────────────────────────────
const CATEGORIES = ['食費', '飲み会', '交通', 'サブスク', '書籍', '娯楽', 'その他'] as const;
type Category = typeof CATEGORIES[number];
const CAT_COLORS: Record<Category, string> = {
  '食費':    '#4F46E5',
  '飲み会':  '#EC4899',
  '交通':    '#06B6D4',
  'サブスク': '#F59E0B',
  '書籍':    '#10B981',
  '娯楽':    '#8B5CF6',
  'その他':  '#9CA3AF',
};

// ── 締め日・給料日 プリセット ─────────────────────────────
const CLOSING_DAY_OPTIONS = [31, 25, 20, 15] as const;
const PAYDAY_DAY_OPTIONS  = [31, 25, 20, 15, 10] as const;

function formatPaySchedule(closingDay: number, offset: number, paydayDay: number): string {
  const c = closingDay === 31 ? '月末締め' : `${closingDay}日締め`;
  const d = paydayDay  === 31 ? '末日'     : `${paydayDay}日`;
  return `${c} → ${offset === 0 ? '当月' : '翌月'}${d}払い`;
}

function formatDateJP(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日（${dow}）`;
}

// ── 収支タブ型 ─────────────────────────────────────────────
type MoneyTab = MoneyTabKey;

const BUDGET_KEY = 'campas_monthly_budget';


function aggregateByCategory(expenses: { amount: number; category: string | null }[]) {
  const map: Record<string, number> = {};
  for (const e of expenses) {
    const cat = e.category ?? 'その他';
    map[cat] = (map[cat] ?? 0) + e.amount;
  }
  return Object.entries(map).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
}

// ─────────────────────────────────────────────────────────────
// メイン画面
// ─────────────────────────────────────────────────────────────
export default function MoneyScreen() {
  const { top: topInset } = useSafeAreaInsets();

  // ── 今月（固定）────────────────────────────────────────────
  const now       = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  // ── 月ナビゲーション（useExpenses より前に宣言が必要）───────
  const [selYear,  setSelYear]  = useState(thisYear);
  const [selMonth, setSelMonth] = useState(thisMonth);
  const selYM          = `${selYear}-${String(selMonth).padStart(2, '0')}`;
  const selMonthLabel  = `${selYear}年${selMonth}月`;
  const isCurrentMonth = selYear === thisYear && selMonth === thisMonth;

  // ── データフック ───────────────────────────────────────────
  const { expenses, isLoading: expLoading, addExpense, updateExpense, deleteExpense, monthlyTotal: expTotal } = useExpenses(selYear, selMonth);
  // カードタブ: 請求期間が2ヶ月にまたがるため前月分も取得して結合
  const prevMonthYear  = selMonth === 1 ? selYear - 1 : selYear;
  const prevMonthMonth = selMonth === 1 ? 12 : selMonth - 1;
  const { expenses: prevExpenses } = useExpenses(prevMonthYear, prevMonthMonth);
  const allExpensesForCard = useMemo(() => [...expenses, ...prevExpenses], [expenses, prevExpenses]);
  const { cards, loading: cardLoading, addCard, updateCard, deleteCard } = useCreditCards();
  const { fixedExpenses, loading: feLoading, monthlyTotal: feMonthlyTotal, annualTotal: feAnnualTotal, addFixedExpense, updateFixedExpense, deleteFixedExpense } = useFixedExpenses();
  const { subscriptions, isLoading: subLoading, addSubscription, updateSubscription, deleteSubscription, monthlyTotal: subTotal } = useSubscriptions();
  const { incomes, salaryRecords: salaryRecordsRaw, isLoading: incLoading, addIncome, deleteIncome, addSalaryRecord, deleteSalaryRecord } = useIncomes();
  const { workplaces, isLoading: wpLoading, addWorkplace, updateWorkplace, deleteWorkplace } = useWorkplaces();
  const { shifts, isLoading: shiftLoading, addShift, updateShift, deleteShift, getForMonth } = useShifts();

  const salaryRecords = salaryRecordsRaw as unknown as SalaryRecord[];

  const [tab, setTab] = useState<MoneyTab>('expenses');

  // ── タブ表示設定 ───────────────────────────────────────────
  const [tabSettings, setTabSettings] = useState<Record<MoneyTabKey, boolean> | null>(null);
  const [tabCustomModal, setTabCustomModal] = useState(false);

  useEffect(() => {
    loadMoneyTabSettings().then(setTabSettings);
  }, []);

  async function toggleTabSetting(key: MoneyTabKey, value: boolean) {
    if (!tabSettings) return;
    const next = { ...tabSettings, [key]: value };
    setTabSettings(next);
    await saveMoneyTabSettings(next);
    // 現在表示中のタブがOFFになった場合は支出にフォールバック
    if (tab === key && !value) setTab('expenses');
  }

  const enabledTabs = tabSettings
    ? ALL_MONEY_TABS.filter(t => tabSettings[t.key])
    : ALL_MONEY_TABS.filter(t => t.key === 'expenses' || t.key === 'subscriptions' || t.key === 'incomes' || t.key === 'salary');

  function prevMonth() {
    if (selMonth === 1) { setSelYear(y => y - 1); setSelMonth(12); }
    else setSelMonth(m => m - 1);
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    if (selMonth === 12) { setSelYear(y => y + 1); setSelMonth(1); }
    else setSelMonth(m => m + 1);
  }
  function goToCurrentMonth() {
    setSelYear(thisYear); setSelMonth(thisMonth);
  }

  // ── 予算 (支出タブ) ───────────────────────────────────────
  const [budget, setBudget] = useState<number | null>(null);
  const [budgetModal, setBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  const loadBudget = useCallback(async () => {
    const v = await AsyncStorage.getItem(BUDGET_KEY);
    if (v) setBudget(parseInt(v, 10));
  }, []);
  useEffect(() => { loadBudget(); }, [loadBudget]);
  async function saveBudget() {
    const v = parseInt(budgetInput, 10);
    if (isNaN(v) || v <= 0) { Alert.alert('入力エラー', '正しい金額を入力してください'); return; }
    await AsyncStorage.setItem(BUDGET_KEY, String(v));
    setBudget(v); setBudgetModal(false);
  }

  // ── 支出 追加 / 編集モーダル ──────────────────────────────
  const [addExpModal, setAddExpModal] = useState(false);
  const [editingExp, setEditingExp]   = useState<Expense | null>(null);
  const [expTitle, setExpTitle]       = useState('');
  const [expAmount, setExpAmount]     = useState('');
  const [expCat, setExpCat]           = useState<Category>('食費');
  const [expDate, setExpDate]         = useState(localYMD(now));
  const [expMemo, setExpMemo]             = useState('');
  const [expPayMethod, setExpPayMethod]   = useState<'cash'|'credit'|'other'>('cash');
  const [expCardId, setExpCardId]         = useState<string | null>(null);
  const [expSaving, setExpSaving]         = useState(false);

  function openAddExpModal() {
    setEditingExp(null);
    const defaultDate = isCurrentMonth
      ? localYMD(now)
      : `${selYear}-${String(selMonth).padStart(2, '0')}-01`;
    setExpTitle(''); setExpAmount(''); setExpCat('食費');
    setExpDate(defaultDate); setExpMemo('');
    setExpPayMethod('cash'); setExpCardId(null);
    setAddExpModal(true);
  }

  function openEditExp(exp: Expense) {
    setEditingExp(exp);
    setExpTitle(exp.title);
    setExpAmount(String(exp.amount));
    setExpCat((exp.category as Category) ?? '食費');
    setExpDate(exp.paid_at ?? localYMD(now));
    setExpMemo(exp.note ?? '');
    const pm = exp.payment_method as string;
    setExpPayMethod(pm === 'cash' ? 'cash' : pm === 'credit' ? 'credit' : 'other');
    setExpCardId(exp.credit_card_id ?? null);
    setAddExpModal(true);
  }

  async function handleSaveExpense() {
    const amount = parseInt(expAmount, 10);
    if (!expTitle.trim() || isNaN(amount) || amount <= 0) {
      Alert.alert('入力エラー', '内容と金額を入力してください'); return;
    }
    if (expPayMethod === 'credit' && !expCardId) {
      Alert.alert('入力エラー', 'クレカを選択してください。先にカードタブでカードを登録してください。'); return;
    }
    setExpSaving(true);
    const payload = {
      title: expTitle.trim(), amount, category: expCat, paid_at: expDate, note: expMemo.trim() || null,
      payment_method: expPayMethod,
      credit_card_id: expPayMethod === 'credit' ? expCardId : null,
    };
    const err = editingExp
      ? await updateExpense(editingExp.id, payload)
      : await addExpense(payload);
    setExpSaving(false);
    if (err) Alert.alert('エラー', err.message); else setAddExpModal(false);
  }

  function confirmDeleteExpense() {
    if (!editingExp) return;
    Alert.alert('削除', `「${editingExp.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => { await deleteExpense(editingExp.id); setAddExpModal(false); },
      },
    ]);
  }

  // ── サブスク追加/編集モーダル ─────────────────────────────
  const [subModal, setSubModal]       = useState(false);
  const [editingSub, setEditingSub]   = useState<Subscription | null>(null);
  const [subName, setSubName]         = useState('');
  const [subAmount, setSubAmount]     = useState('');
  const [subDay, setSubDay]           = useState('');
  const [subMemo, setSubMemo]         = useState('');
  const [subSaving, setSubSaving]     = useState(false);

  function openSubModal(sub?: Subscription) {
    if (sub) { setEditingSub(sub); setSubName(sub.service_name); setSubAmount(String(sub.amount)); setSubDay(String(sub.renewal_day)); setSubMemo(sub.memo ?? ''); }
    else      { setEditingSub(null); setSubName(''); setSubAmount(''); setSubDay(''); setSubMemo(''); }
    setSubModal(true);
  }
  async function handleSaveSub() {
    const amount = parseInt(subAmount, 10);
    const day    = parseInt(subDay, 10);
    if (!subName.trim()) { Alert.alert('入力エラー', 'サービス名を入力してください'); return; }
    if (isNaN(amount) || amount <= 0) { Alert.alert('入力エラー', '月額を入力してください'); return; }
    if (isNaN(day) || day < 1 || day > 31) { Alert.alert('入力エラー', '更新日は1〜31で入力してください'); return; }
    setSubSaving(true);
    const payload = { service_name: subName.trim(), amount, renewal_day: day, memo: subMemo.trim() || null };
    const err = editingSub ? await updateSubscription(editingSub.id, payload) : await addSubscription({ ...payload, is_active: true });
    setSubSaving(false);
    if (err) Alert.alert('エラー', err.message); else setSubModal(false);
  }

  // ── 収入追加モーダル ──────────────────────────────────────
  const [addIncModal, setAddIncModal]     = useState(false);
  const [incType, setIncType]             = useState<IncomeType>('salary');
  const [incTitle, setIncTitle]           = useState('');
  const [incAmount, setIncAmount]         = useState('');
  const [incDate, setIncDate]             = useState(selYM + '-25');
  const [incMemo, setIncMemo]             = useState('');
  const [incSaving, setIncSaving]         = useState(false);

  function openAddIncModal() {
    setIncType('salary'); setIncTitle(''); setIncAmount(''); setIncDate(selYM + '-25'); setIncMemo('');
    setAddIncModal(true);
  }
  async function handleAddIncome() {
    const amount = parseInt(incAmount, 10);
    if (!incTitle.trim()) { Alert.alert('入力エラー', 'タイトルを入力してください'); return; }
    if (isNaN(amount) || amount <= 0) { Alert.alert('入力エラー', '金額を入力してください'); return; }
    setIncSaving(true);
    const err = await addIncome({ title: incTitle.trim(), amount, income_type: incType, received_at: incDate, note: incMemo.trim() || null });
    setIncSaving(false);
    if (err) Alert.alert('エラー', err.message); else setAddIncModal(false);
  }

  // ── バイト先モーダル ──────────────────────────────────────
  const [wpModal, setWpModal]                               = useState(false);
  const [editingWp, setEditingWp]                           = useState<Workplace | null>(null);
  const [wpName, setWpName]                                 = useState('');
  const [wpWage, setWpWage]                                 = useState('');
  const [wpColor, setWpColor]                               = useState<string>(WORKPLACE_COLORS[0]);
  const [wpNote, setWpNote]                                 = useState('');
  const [wpClosingDay, setWpClosingDay]                     = useState(31);
  const [wpPaydayMonthOffset, setWpPaydayMonthOffset]       = useState(1);
  const [wpPaydayDay, setWpPaydayDay]                       = useState(25);
  const [wpSaving, setWpSaving]                             = useState(false);

  function openWpModal(wp?: Workplace) {
    if (wp) {
      setEditingWp(wp); setWpName(wp.name); setWpWage(String(wp.hourly_wage)); setWpColor(wp.color); setWpNote(wp.note ?? '');
      setWpClosingDay(wp.closing_day ?? 31);
      setWpPaydayMonthOffset(wp.payday_month_offset ?? 1);
      setWpPaydayDay(wp.payday_day ?? 25);
    } else {
      setEditingWp(null); setWpName(''); setWpWage(''); setWpColor(WORKPLACE_COLORS[0]); setWpNote('');
      setWpClosingDay(31); setWpPaydayMonthOffset(1); setWpPaydayDay(25);
    }
    setWpModal(true);
  }
  async function handleSaveWorkplace() {
    const wage = parseInt(wpWage, 10);
    if (!wpName.trim()) { Alert.alert('入力エラー', 'バイト先名を入力してください'); return; }
    if (isNaN(wage) || wage <= 0) { Alert.alert('入力エラー', '時給を入力してください'); return; }
    setWpSaving(true);
    const payload = { name: wpName.trim(), hourly_wage: wage, color: wpColor, note: wpNote.trim() || null, is_active: true, closing_day: wpClosingDay, payday_month_offset: wpPaydayMonthOffset, payday_day: wpPaydayDay };
    const err = editingWp ? await updateWorkplace(editingWp.id, payload) : await addWorkplace(payload);
    setWpSaving(false);
    if (err) Alert.alert('エラー', err.message); else setWpModal(false);
  }

  // ── シフト追加 / 編集モーダル ─────────────────────────────
  const [shiftModal, setShiftModal]       = useState(false);
  const [editingShift, setEditingShift]   = useState<ShiftWithWorkplace | null>(null);
  const [sfWpId, setSfWpId]               = useState('');
  const [sfDate, setSfDate]               = useState(localYMD(now));
  const [sfStart, setSfStart]             = useState('09:00');
  const [sfEnd, setSfEnd]                 = useState('18:00');
  const [sfBreak, setSfBreak]             = useState('60');
  const [sfNote, setSfNote]               = useState('');
  const [sfSaving, setSfSaving]           = useState(false);

  function openShiftModal() {
    setEditingShift(null);
    setSfWpId(workplaces[0]?.id ?? '');
    setSfDate(localYMD(now));
    setSfStart('09:00'); setSfEnd('18:00'); setSfBreak('60'); setSfNote('');
    setShiftModal(true);
  }

  function openEditShiftModal(shift: ShiftWithWorkplace) {
    setEditingShift(shift);
    setSfWpId(shift.workplace_id);
    setSfDate(shift.date);
    setSfStart(shift.start_time);
    setSfEnd(shift.end_time);
    setSfBreak(String(shift.break_minutes ?? 0));
    setSfNote(shift.note ?? '');
    setShiftModal(true);
  }

  const shiftWagePreview = useMemo(() => {
    const wp = workplaces.find(w => w.id === sfWpId);
    if (!wp) return null;
    try {
      const wage = calcWage(wp.hourly_wage, sfStart, sfEnd, parseInt(sfBreak, 10) || 0);
      const mins = calcWorkMinutes(sfStart, sfEnd, parseInt(sfBreak, 10) || 0);
      return { wage, duration: formatMinutes(mins) };
    } catch { return null; }
  }, [sfWpId, sfStart, sfEnd, sfBreak, workplaces]);

  async function handleSaveShift() {
    if (!sfWpId) { Alert.alert('入力エラー', 'バイト先を選択してください'); return; }
    const wp = workplaces.find(w => w.id === sfWpId);
    if (!wp) return;
    setSfSaving(true);
    const payload = { workplace_id: sfWpId, date: sfDate, start_time: sfStart, end_time: sfEnd, break_minutes: parseInt(sfBreak, 10) || 0, note: sfNote.trim() || null };
    const err = editingShift
      ? await updateShift(editingShift.id, payload, wp.hourly_wage)
      : await addShift(payload, wp.hourly_wage);
    setSfSaving(false);
    if (err) Alert.alert('エラー', err.message); else setShiftModal(false);
  }

  function confirmDeleteShift() {
    if (!editingShift) return;
    Alert.alert('削除', `${editingShift.workplace?.name ?? 'バイト'}（${editingShift.date}）を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => { await deleteShift(editingShift.id); setShiftModal(false); } },
    ]);
  }

  // ── 給与記録追加モーダル ──────────────────────────────────
  const [salaryModal, setSalaryModal] = useState(false);
  const [salWpId, setSalWpId]         = useState('');
  const [salYM, setSalYM]             = useState(selYM);
  const [salAmount, setSalAmount]     = useState('');
  const [salNote, setSalNote]         = useState('');
  const [salSaving, setSalSaving]     = useState(false);

  function openSalaryModal() {
    setSalWpId(workplaces[0]?.id ?? ''); setSalYM(selYM); setSalAmount(''); setSalNote('');
    setSalaryModal(true);
  }
  async function handleAddSalary() {
    const amount = parseInt(salAmount, 10);
    if (isNaN(amount) || amount <= 0) { Alert.alert('入力エラー', '金額を入力してください'); return; }
    setSalSaving(true);
    const err = await addSalaryRecord({ workplace_id: salWpId || null, year_month: salYM, amount, note: salNote.trim() || null });
    setSalSaving(false);
    if (err) Alert.alert('エラー', err.message); else setSalaryModal(false);
  }

  // ── カード追加 / 編集モーダル ─────────────────────────────
  const [cardModal, setCardModal]         = useState(false);
  const [editingCard, setEditingCard]     = useState<CreditCard | null>(null);
  const [cardName, setCardName]           = useState('');
  const [cardColor, setCardColor]         = useState('#4F8EF7');
  const [cardClosingDay, setCardClosingDay] = useState('25');
  const [cardPayDay, setCardPayDay]       = useState('10');
  const [cardPayOffset, setCardPayOffset] = useState<0|1>(1);
  const [cardSaving, setCardSaving]       = useState(false);

  const CARD_COLORS = ['#4F8EF7','#10B981','#F59E0B','#EC4899','#8B5CF6','#EF4444','#06B6D4','#64748B'];

  function openAddCardModal() {
    setEditingCard(null);
    setCardName(''); setCardColor('#4F8EF7'); setCardClosingDay('25'); setCardPayDay('10'); setCardPayOffset(1);
    setCardModal(true);
  }
  function openEditCard(card: CreditCard) {
    setEditingCard(card);
    setCardName(card.name); setCardColor(card.color);
    setCardClosingDay(String(card.closing_day)); setCardPayDay(String(card.payment_day));
    setCardPayOffset(card.payment_month_offset as 0|1);
    setCardModal(true);
  }
  async function handleSaveCard() {
    const closing = parseInt(cardClosingDay, 10);
    const payment = parseInt(cardPayDay, 10);
    if (!cardName.trim() || isNaN(closing) || isNaN(payment)) {
      Alert.alert('入力エラー', 'カード名・締め日・支払日を入力してください'); return;
    }
    setCardSaving(true);
    try {
      if (editingCard) {
        await updateCard(editingCard.id, { name: cardName.trim(), color: cardColor, closing_day: closing, payment_day: payment, payment_month_offset: cardPayOffset });
      } else {
        await addCard({ name: cardName.trim(), color: cardColor, closing_day: closing, payment_day: payment, payment_month_offset: cardPayOffset });
      }
      setCardModal(false);
    } catch (e: any) { Alert.alert('エラー', e.message); }
    setCardSaving(false);
  }

  // ── 固定費 追加/編集モーダル ──────────────────────────────
  const [feModal, setFeModal]               = useState(false);
  const [editingFe, setEditingFe]           = useState<FixedExpense | null>(null);
  const [feName, setFeName]                 = useState('');
  const [feAmount, setFeAmount]             = useState('');
  const [feDay, setFeDay]                   = useState('');
  const [feCategory, setFeCategory]         = useState<FixedExpenseCategory>('other');
  const [feMemo, setFeMemo]                 = useState('');
  const [feSaving, setFeSaving]             = useState(false);
  // 定期タブ内セグメント: 'subscriptions' | 'fixed_expenses'
  const [recurringSegment, setRecurringSegment] = useState<'subscriptions' | 'fixed_expenses'>('subscriptions');

  function openAddFeModal() {
    setEditingFe(null);
    setFeName(''); setFeAmount(''); setFeDay(''); setFeCategory('other'); setFeMemo('');
    setFeModal(true);
  }
  function openEditFe(fe: FixedExpense) {
    setEditingFe(fe);
    setFeName(fe.name); setFeAmount(String(fe.amount)); setFeDay(String(fe.payment_day));
    setFeCategory(fe.category); setFeMemo(fe.memo ?? '');
    setFeModal(true);
  }
  async function handleSaveFe() {
    const amount = parseInt(feAmount, 10);
    const day    = parseInt(feDay, 10);
    if (!feName.trim()) { Alert.alert('入力エラー', '名前を入力してください'); return; }
    if (isNaN(amount) || amount <= 0) { Alert.alert('入力エラー', '金額を入力してください'); return; }
    if (isNaN(day) || day < 1 || day > 31) { Alert.alert('入力エラー', '支払日は1〜31で入力してください'); return; }
    setFeSaving(true);
    try {
      const payload = { name: feName.trim(), amount, payment_day: day, category: feCategory, memo: feMemo.trim() || null };
      if (editingFe) {
        const updated = await updateFixedExpense(editingFe.id, payload);
        await cancelFixedExpenseNotification(editingFe.id);
        await scheduleFixedExpenseNotification(updated);
      } else {
        const created = await addFixedExpense({ ...payload, is_active: true });
        await scheduleFixedExpenseNotification(created);
      }
      setFeModal(false);
    } catch (e: any) { Alert.alert('エラー', e.message); }
    setFeSaving(false);
  }

  // ── 集計 ──────────────────────────────────────────────────
  const remaining  = budget !== null ? budget - expTotal : null;
  const usageRate  = budget ? Math.min(expTotal / budget, 1) : 0;
  const overBudget = budget !== null && expTotal > budget;
  const catData    = aggregateByCategory(expenses);
  const maxCat     = catData[0]?.total ?? 1;

  const selMonthIncomes    = useMemo(() => incomes.filter(i => i.received_at.startsWith(selYM)), [incomes, selYM]);
  const monthlyIncomeTotal = useMemo(() => selMonthIncomes.reduce((s, i) => s + i.amount, 0), [selMonthIncomes]);
  const thisMonthShifts    = getForMonth(selYear, selMonth);

  const isLoading = expLoading || subLoading || incLoading || wpLoading || shiftLoading || cardLoading || feLoading;

  // ── FAB押下 ──────────────────────────────────────────────
  function handleAdd() {
    if (tab === 'expenses')      openAddExpModal();
    else if (tab === 'subscriptions') {
      if (recurringSegment === 'subscriptions') openSubModal();
      else openAddFeModal();
    }
    else if (tab === 'incomes')       openAddIncModal();
    else if (tab === 'salary')        openSalaryModal();
    else if (tab === 'cards')         openAddCardModal();
    else if (tab === 'fixed_expenses') openAddFeModal();
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* ── ヘッダー ── */}
      <View style={styles.header}>
        <Text style={styles.title}>お金</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tab === 'expenses' && (
            <TouchableOpacity style={styles.outlineBtn} onPress={() => { setBudgetInput(budget ? String(budget) : ''); setBudgetModal(true); }}>
              <Text style={styles.outlineBtnText}>予算</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.primaryBtn} onPress={handleAdd}>
            <Text style={styles.primaryBtnText}>＋ 追加</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 月ナビゲーター ── */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={isCurrentMonth ? undefined : goToCurrentMonth}
          style={styles.monthNavCenter}
          activeOpacity={isCurrentMonth ? 1 : 0.6}
        >
          <Text style={styles.monthNavText}>{selYear}年{selMonth}月</Text>
          {!isCurrentMonth && <Text style={styles.monthNavBackText}>今月に戻る</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn} disabled={isCurrentMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={22} color={isCurrentMonth ? COLORS.gray200 : COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* ── サブタブ ── */}
      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', gap: SPACING.sm, paddingRight: SPACING.sm }}
          style={{ flex: 1 }}
        >
          {enabledTabs.map(({ key, label }) => (
            <TouchableOpacity key={key} style={[styles.tabItem, tab === key && styles.tabItemActive]} onPress={() => setTab(key)}>
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          onPress={() => setTabCustomModal(true)}
          style={styles.tabAddBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={20} color={COLORS.gray500} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      ) : (
        <View style={{ flex: 1 }}>
          {tab === 'expenses'      && <ExpensesTab expenses={expenses} monthlyTotal={expTotal} budget={budget} remaining={remaining} usageRate={usageRate} overBudget={overBudget} catData={catData} maxCat={maxCat} monthLabel={selMonthLabel} onEdit={openEditExp} onSetBudget={() => { setBudgetInput(''); setBudgetModal(true); }} />}
          {tab === 'subscriptions' && (
            <View style={{ flex: 1 }}>
              {/* セグメント: サブスク / 固定費 */}
              <View style={{ flexDirection: 'row', margin: SPACING.md, backgroundColor: COLORS.gray100, borderRadius: RADIUS.full, padding: 3 }}>
                {(['subscriptions', 'fixed_expenses'] as const).map((seg, i) => (
                  <TouchableOpacity key={seg} onPress={() => setRecurringSegment(seg)}
                    style={{ flex: 1, paddingVertical: 7, borderRadius: RADIUS.full, alignItems: 'center', backgroundColor: recurringSegment === seg ? COLORS.white : 'transparent' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: recurringSegment === seg ? COLORS.gray900 : COLORS.gray500 }}>
                      {i === 0 ? 'サブスク' : '固定費'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {recurringSegment === 'subscriptions'
                ? <SubscriptionsTab {...{ subscriptions, monthlyTotal: subTotal }} onEdit={openSubModal} onDelete={id => deleteSubscription(id)} />
                : <FixedExpensesTab fixedExpenses={fixedExpenses} monthlyTotal={feMonthlyTotal} annualTotal={feAnnualTotal} onEdit={openEditFe} onDelete={async id => { await deleteFixedExpense(id); await cancelFixedExpenseNotification(id); }} />
              }
            </View>
          )}
          {tab === 'fixed_expenses' && <FixedExpensesTab fixedExpenses={fixedExpenses} monthlyTotal={feMonthlyTotal} annualTotal={feAnnualTotal} onEdit={openEditFe} onDelete={async id => { await deleteFixedExpense(id); await cancelFixedExpenseNotification(id); }} />}
          {tab === 'incomes'       && <IncomesTab incomes={selMonthIncomes} monthlyTotal={monthlyIncomeTotal} monthLabel={selMonthLabel} onDelete={deleteIncome} />}
          {tab === 'cards'         && <CardsTab cards={cards} expenses={allExpensesForCard} onEdit={openEditCard} onDelete={id => Alert.alert('削除', 'カードを削除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => deleteCard(id) }])} />}
          {tab === 'salary'        && <SalaryTab workplaces={workplaces} thisMonthShifts={thisMonthShifts} allShifts={shifts} salaryRecords={salaryRecords} monthLabel={selMonthLabel} onAddWorkplace={() => openWpModal()} onEditWorkplace={openWpModal} onDeleteWorkplace={(id) => Alert.alert('削除', 'バイト先を削除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => deleteWorkplace(id) }])} onAddSalary={openSalaryModal} onDeleteSalary={id => Alert.alert('削除', '給与記録を削除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => deleteSalaryRecord(id) }])} />}
        </View>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          モーダル群
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}

      {/* 予算設定 */}
      <Modal visible={budgetModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <ModalHeader title="月予算を設定" onCancel={() => setBudgetModal(false)} onSave={saveBudget} saveLabel="保存" />
          <View style={{ padding: 24 }}>
            <Text style={styles.inputLabel}>月の予算（円）</Text>
            <TextInput style={[styles.input, { fontSize: 28, fontWeight: '800', textAlign: 'center' }]} placeholder="例: 30000" value={budgetInput} onChangeText={setBudgetInput} keyboardType="number-pad" autoFocus />
          </View>
        </SafeAreaView>
      </Modal>

      {/* 支出 追加 / 編集 */}
      <Modal visible={addExpModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ModalHeader title={editingExp ? '支出を編集' : '支出を追加'} onCancel={() => setAddExpModal(false)} onSave={handleSaveExpense} saveLabel={expSaving ? '保存中...' : editingExp ? '更新' : '追加'} disabled={expSaving} />
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>内容 *</Text>
              <TextInput style={styles.input} placeholder="例: ランチ" value={expTitle} onChangeText={setExpTitle} autoFocus />
              <Text style={styles.inputLabel}>金額（円）*</Text>
              <TextInput style={styles.input} placeholder="例: 850" value={expAmount} onChangeText={setExpAmount} keyboardType="number-pad" />
              <Text style={styles.inputLabel}>カテゴリ</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity key={c} style={[styles.chip, { borderColor: CAT_COLORS[c] }, expCat === c && { backgroundColor: CAT_COLORS[c] }]} onPress={() => setExpCat(c)}>
                    <Text style={[styles.chipText, expCat === c && { color: '#fff' }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <InlineDatePicker label="日付" value={expDate} onChange={setExpDate} />
              <Text style={styles.inputLabel}>支払方法</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: SPACING.sm }}>
                {([['cash','現金'],['credit','クレジット'],['other','その他']] as const).map(([v, label]) => (
                  <TouchableOpacity key={v} onPress={() => { setExpPayMethod(v); if (v !== 'credit') setExpCardId(null); }}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: RADIUS.md, backgroundColor: expPayMethod === v ? COLORS.primary : COLORS.gray100, alignItems: 'center' }}>
                    <Text style={{ color: expPayMethod === v ? '#fff' : COLORS.gray600, fontWeight: '600', fontSize: 13 }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {expPayMethod === 'credit' && cards.length > 0 && (
                <>
                  <Text style={styles.inputLabel}>カード選択</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, marginBottom: SPACING.sm }}>
                    {cards.map(c => (
                      <TouchableOpacity key={c.id} onPress={() => setExpCardId(c.id)}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.md, backgroundColor: expCardId === c.id ? c.color : COLORS.gray100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: expCardId === c.id ? '#fff' : c.color }} />
                        <Text style={{ color: expCardId === c.id ? '#fff' : COLORS.gray700, fontWeight: '600', fontSize: 13 }}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}
              <Text style={styles.inputLabel}>メモ（任意）</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="例: 友達とランチ" value={expMemo} onChangeText={setExpMemo} multiline />
              {editingExp && (
                <TouchableOpacity style={styles.deleteModalBtn} onPress={confirmDeleteExpense}>
                  <Text style={styles.deleteModalBtnText}>🗑 この支出を削除する</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* サブスク追加/編集 */}
      <Modal visible={subModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ModalHeader title={editingSub ? 'サブスクを編集' : 'サブスクを追加'} onCancel={() => setSubModal(false)} onSave={handleSaveSub} saveLabel={subSaving ? '保存中...' : editingSub ? '更新' : '追加'} disabled={subSaving} />
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>サービス名 *</Text>
              <TextInput style={styles.input} placeholder="例: Netflix" value={subName} onChangeText={setSubName} autoFocus />
              <Text style={styles.inputLabel}>月額（円）*</Text>
              <TextInput style={styles.input} placeholder="例: 1490" value={subAmount} onChangeText={setSubAmount} keyboardType="number-pad" />
              <Text style={styles.inputLabel}>更新日 * <Text style={{ fontSize: 11, color: COLORS.gray400, fontWeight: '400' }}>（29〜31日は月末に自動調整）</Text></Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dayBtn, subDay === String(d) && styles.dayBtnActive]}
                    onPress={() => setSubDay(String(d))}
                  >
                    <Text style={[styles.dayBtnText, subDay === String(d) && styles.dayBtnTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.inputLabel}>メモ（任意）</Text>
              <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} placeholder="例: スタンダードプラン" value={subMemo} onChangeText={setSubMemo} multiline />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* 収入追加 */}
      <Modal visible={addIncModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ModalHeader title="収入を追加" onCancel={() => setAddIncModal(false)} onSave={handleAddIncome} saveLabel={incSaving ? '保存中...' : '追加'} disabled={incSaving} />
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>種類</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {(Object.entries(INCOME_TYPE_CONFIG) as [IncomeType, typeof INCOME_TYPE_CONFIG[IncomeType]][]).map(([k, cfg]) => (
                  <TouchableOpacity key={k} style={[styles.chip, { borderColor: cfg.color }, incType === k && { backgroundColor: cfg.color }]} onPress={() => setIncType(k)}>
                    <Text style={[styles.chipText, incType === k && { color: '#fff' }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.inputLabel}>タイトル *</Text>
              <TextInput style={styles.input} placeholder="例: 7月給与" value={incTitle} onChangeText={setIncTitle} autoFocus />
              <Text style={styles.inputLabel}>金額（円）*</Text>
              <TextInput style={styles.input} placeholder="例: 80000" value={incAmount} onChangeText={setIncAmount} keyboardType="number-pad" />
              <InlineDatePicker label="受取日" value={incDate} onChange={setIncDate} />
              <Text style={styles.inputLabel}>メモ（任意）</Text>
              <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} placeholder="例: 残業代込み" value={incMemo} onChangeText={setIncMemo} multiline />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* バイト先追加/編集 */}
      <Modal visible={wpModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ModalHeader title={editingWp ? 'バイト先を編集' : 'バイト先を追加'} onCancel={() => setWpModal(false)} onSave={handleSaveWorkplace} saveLabel={wpSaving ? '保存中...' : editingWp ? '更新' : '追加'} disabled={wpSaving} />
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>バイト先名 *</Text>
              <TextInput style={styles.input} placeholder="例: スターバックス渋谷店" value={wpName} onChangeText={setWpName} autoFocus />
              <Text style={styles.inputLabel}>時給（円）*</Text>
              <TextInput style={styles.input} placeholder="例: 1100" value={wpWage} onChangeText={setWpWage} keyboardType="number-pad" />
              <Text style={styles.inputLabel}>カラー</Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', paddingVertical: 4 }}>
                {WORKPLACE_COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setWpColor(c)} style={[styles.colorCircle, { backgroundColor: c }, wpColor === c && styles.colorCircleSelected]} />
                ))}
              </View>
              <Text style={styles.inputLabel}>締め日</Text>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {CLOSING_DAY_OPTIONS.map(d => (
                  <TouchableOpacity key={d} style={[styles.chip, { borderColor: COLORS.primary }, wpClosingDay === d && { backgroundColor: COLORS.primary }]} onPress={() => setWpClosingDay(d)}>
                    <Text style={[styles.chipText, wpClosingDay === d && { color: '#fff' }]}>{d === 31 ? '末日' : `${d}日`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.inputLabel}>支払い月</Text>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {([1, 0] as const).map(offset => (
                  <TouchableOpacity key={offset} style={[styles.chip, { borderColor: COLORS.primary }, wpPaydayMonthOffset === offset && { backgroundColor: COLORS.primary }]} onPress={() => setWpPaydayMonthOffset(offset)}>
                    <Text style={[styles.chipText, wpPaydayMonthOffset === offset && { color: '#fff' }]}>{offset === 1 ? '翌月' : '当月'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.inputLabel}>給料日</Text>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4, flexWrap: 'wrap' }}>
                {PAYDAY_DAY_OPTIONS.map(d => (
                  <TouchableOpacity key={d} style={[styles.chip, { borderColor: COLORS.primary }, wpPaydayDay === d && { backgroundColor: COLORS.primary }]} onPress={() => setWpPaydayDay(d)}>
                    <Text style={[styles.chipText, wpPaydayDay === d && { color: '#fff' }]}>{d === 31 ? '末日' : `${d}日`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.inputLabel}>メモ（任意）</Text>
              <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} placeholder="例: 週2〜3日" value={wpNote} onChangeText={setWpNote} multiline />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* シフト追加 */}
      <Modal visible={shiftModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ModalHeader title={editingShift ? 'シフトを編集' : 'シフトを追加'} onCancel={() => setShiftModal(false)} onSave={handleSaveShift} saveLabel={sfSaving ? '保存中...' : editingShift ? '更新' : '追加'} disabled={sfSaving} />
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {workplaces.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="business-outline" size={36} color="#D1D5DB" />
                  <Text style={styles.emptyText}>先にバイト先を登録してください</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.inputLabel}>バイト先</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                    {workplaces.map(w => (
                      <TouchableOpacity key={w.id} style={[styles.chip, { borderColor: w.color }, sfWpId === w.id && { backgroundColor: w.color }]} onPress={() => setSfWpId(w.id)}>
                        <Text style={[styles.chipText, sfWpId === w.id && { color: '#fff' }]}>{w.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <InlineDatePicker label="日付" value={sfDate} onChange={setSfDate} />
                  <InlineTimePicker label="開始時刻" value={sfStart} onChange={setSfStart} />
                  <InlineTimePicker label="終了時刻" value={sfEnd} onChange={setSfEnd} />
                  <Text style={styles.inputLabel}>休憩時間（分）</Text>
                  <TextInput style={styles.input} placeholder="60" value={sfBreak} onChangeText={setSfBreak} keyboardType="number-pad" />
                  {shiftWagePreview && (
                    <View style={styles.wagePreview}>
                      <Text style={styles.wagePreviewLabel}>給与見込み</Text>
                      <Text style={styles.wagePreviewWage}>¥{shiftWagePreview.wage.toLocaleString()}</Text>
                      <Text style={styles.wagePreviewDuration}>{shiftWagePreview.duration}</Text>
                    </View>
                  )}
                  <Text style={styles.inputLabel}>メモ（任意）</Text>
                  <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} placeholder="例: 早番" value={sfNote} onChangeText={setSfNote} multiline />
                  {editingShift && (
                    <TouchableOpacity style={styles.deleteModalBtn} onPress={confirmDeleteShift}>
                      <Text style={styles.deleteModalBtnText}>🗑 このシフトを削除する</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* 給与記録追加 */}
      <Modal visible={salaryModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ModalHeader title="給与記録を追加" onCancel={() => setSalaryModal(false)} onSave={handleAddSalary} saveLabel={salSaving ? '保存中...' : '追加'} disabled={salSaving} />
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>バイト先（任意）</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                <TouchableOpacity style={[styles.chip, { borderColor: COLORS.gray400 }, !salWpId && { backgroundColor: COLORS.gray400 }]} onPress={() => setSalWpId('')}>
                  <Text style={[styles.chipText, !salWpId && { color: '#fff' }]}>未設定</Text>
                </TouchableOpacity>
                {workplaces.map(w => (
                  <TouchableOpacity key={w.id} style={[styles.chip, { borderColor: w.color }, salWpId === w.id && { backgroundColor: w.color }]} onPress={() => setSalWpId(w.id)}>
                    <Text style={[styles.chipText, salWpId === w.id && { color: '#fff' }]}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <InlineDatePicker
                label="年月"
                value={salYM ? salYM + '-01' : ''}
                onChange={d => setSalYM(d.slice(0, 7))}
                format="yearMonth"
              />
              <Text style={styles.inputLabel}>実際の受取額（円）*</Text>
              <TextInput style={styles.input} placeholder="例: 85000" value={salAmount} onChangeText={setSalAmount} keyboardType="number-pad" autoFocus />
              <Text style={styles.inputLabel}>メモ（任意）</Text>
              <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} placeholder="例: 交通費込み" value={salNote} onChangeText={setSalNote} multiline />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── カード追加 / 編集モーダル ── */}
      <Modal visible={cardModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <ModalHeader title={editingCard ? 'カードを編集' : 'カードを追加'} onCancel={() => setCardModal(false)} onSave={handleSaveCard} saveLabel={cardSaving ? '保存中...' : '保存'} disabled={cardSaving} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: SPACING.md, gap: SPACING.sm }}>
              <Text style={styles.inputLabel}>カード名 *</Text>
              <TextInput style={styles.input} placeholder="例: 楽天カード" value={cardName} onChangeText={setCardName} autoFocus />
              <Text style={styles.inputLabel}>カラー</Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {CARD_COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setCardColor(c)}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: cardColor === c ? 3 : 0, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 }} />
                ))}
              </View>
              <Text style={styles.inputLabel}>締め日 *</Text>
              <TextInput style={styles.input} placeholder="例: 25（末日は31）" value={cardClosingDay} onChangeText={setCardClosingDay} keyboardType="number-pad" />
              <Text style={styles.inputLabel}>支払日 *</Text>
              <TextInput style={styles.input} placeholder="例: 10（末日は31）" value={cardPayDay} onChangeText={setCardPayDay} keyboardType="number-pad" />
              <Text style={styles.inputLabel}>支払月</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([0, 1] as const).map(v => (
                  <TouchableOpacity key={v} onPress={() => setCardPayOffset(v)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: cardPayOffset === v ? COLORS.primary : COLORS.gray100, alignItems: 'center' }}>
                    <Text style={{ color: cardPayOffset === v ? '#fff' : COLORS.gray700, fontWeight: '600' }}>{v === 0 ? '当月払い' : '翌月払い'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {editingCard && (
                <TouchableOpacity style={{ marginTop: SPACING.md, alignItems: 'center' }}
                  onPress={() => Alert.alert('削除', `${editingCard.name}を削除しますか？`, [
                    { text: 'キャンセル', style: 'cancel' },
                    { text: '削除', style: 'destructive', onPress: async () => { await deleteCard(editingCard.id); setCardModal(false); } },
                  ])}>
                  <Text style={{ color: '#EF4444', fontWeight: '600' }}>このカードを削除</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── 固定費 追加/編集モーダル ── */}
      <Modal visible={feModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <ModalHeader title={editingFe ? '固定費を編集' : '固定費を追加'} onCancel={() => setFeModal(false)} onSave={handleSaveFe} saveLabel={feSaving ? '保存中...' : editingFe ? '更新' : '追加'} disabled={feSaving} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: SPACING.md, gap: SPACING.sm }}>
              <Text style={styles.inputLabel}>名前 *</Text>
              <TextInput style={styles.input} placeholder="例: 家賃" value={feName} onChangeText={setFeName} autoFocus />
              <Text style={styles.inputLabel}>金額（円）*</Text>
              <TextInput style={styles.input} placeholder="例: 75000" value={feAmount} onChangeText={setFeAmount} keyboardType="number-pad" />
              <Text style={styles.inputLabel}>支払日 *</Text>
              <TextInput style={styles.input} placeholder="例: 27（末日は31）" value={feDay} onChangeText={setFeDay} keyboardType="number-pad" />
              <Text style={styles.inputLabel}>カテゴリ</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {FIXED_EXPENSE_CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat.key} onPress={() => setFeCategory(cat.key)}
                    style={[styles.chip, { borderColor: cat.color }, feCategory === cat.key && { backgroundColor: cat.color }]}>
                    <Text style={[styles.chipText, feCategory === cat.key && { color: '#fff' }]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.inputLabel}>メモ（任意）</Text>
              <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} placeholder="例: 東京電力" value={feMemo} onChangeText={setFeMemo} multiline />
              {editingFe && (
                <TouchableOpacity style={styles.deleteModalBtn}
                  onPress={() => Alert.alert('削除', `${editingFe.name}を削除しますか？`, [
                    { text: 'キャンセル', style: 'cancel' },
                    { text: '削除', style: 'destructive', onPress: async () => {
                      await deleteFixedExpense(editingFe.id);
                      await cancelFixedExpenseNotification(editingFe.id);
                      setFeModal(false);
                    }},
                  ])}>
                  <Text style={styles.deleteModalBtnText}>🗑 この固定費を削除する</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── タブカスタマイズモーダル ── */}
      <Modal visible={tabCustomModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={{ width: 60 }} />
            <Text style={styles.modalTitle}>表示する項目</Text>
            <TouchableOpacity onPress={() => setTabCustomModal(false)} style={{ width: 60, alignItems: 'flex-end' }}>
              <Text style={styles.saveText}>完了</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: SPACING.md }}>
            <Text style={{ fontSize: 13, color: COLORS.gray400, marginBottom: SPACING.md, lineHeight: 18 }}>
              ONにした項目がお金タブに表示されます。設定は端末に保存されます。
            </Text>
            {ALL_MONEY_TABS.map(tabDef => {
              const isRequired = tabDef.required ?? false;
              const isDisabled = tabDef.disabled ?? false;
              const isOn = tabSettings ? tabSettings[tabDef.key] : false;
              return (
                <View key={tabDef.key} style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray100,
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, color: isDisabled ? COLORS.gray300 : COLORS.gray900, fontWeight: '500' }}>
                      {tabDef.label}
                      {isRequired && <Text style={{ fontSize: 12, color: COLORS.gray400 }}>（必須）</Text>}
                      {isDisabled && <Text style={{ fontSize: 12, color: COLORS.gray300 }}>　準備中</Text>}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => !isRequired && !isDisabled && toggleTabSetting(tabDef.key, !isOn)}
                    activeOpacity={isRequired || isDisabled ? 1 : 0.7}
                    style={{
                      width: 50, height: 30, borderRadius: 15,
                      backgroundColor: (isRequired || isOn) && !isDisabled ? COLORS.primary : COLORS.gray200,
                      justifyContent: 'center',
                      paddingHorizontal: 2,
                      opacity: isDisabled ? 0.4 : 1,
                    }}
                  >
                    <View style={{
                      width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
                      alignSelf: (isRequired || isOn) && !isDisabled ? 'flex-end' : 'flex-start',
                    }} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// 支出タブ
// ─────────────────────────────────────────────────────────────
function ExpensesTab({ expenses, monthlyTotal, budget, remaining, usageRate, overBudget, catData, maxCat, monthLabel, onEdit, onSetBudget }: {
  expenses: Database['public']['Tables']['expenses']['Row'][];
  monthlyTotal: number; budget: number | null; remaining: number | null;
  usageRate: number; overBudget: boolean;
  catData: { cat: string; total: number }[]; maxCat: number;
  monthLabel: string;
  onEdit: (item: Database['public']['Tables']['expenses']['Row']) => void;
  onSetBudget: () => void;
}) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.summaryCard}>
        <Text style={styles.summarySubLabel}>{monthLabel}の支出</Text>
        <Text style={[styles.summaryAmount, overBudget && { color: COLORS.danger }]}>
          ¥{monthlyTotal.toLocaleString()}
        </Text>
        {budget !== null ? (
          <View style={{ marginTop: 14 }}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${usageRate * 100}%`, backgroundColor: overBudget ? COLORS.danger : COLORS.primary }]} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={[{ fontSize: 13, fontWeight: '700', color: COLORS.gray600 }, overBudget && { color: COLORS.danger }]}>
                {overBudget ? `¥${(monthlyTotal - budget).toLocaleString()} オーバー` : `残り ¥${remaining!.toLocaleString()}`}
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.gray400 }}>予算 ¥{budget.toLocaleString()}</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={onSetBudget}>
            <Text style={{ marginTop: 10, color: COLORS.primary, fontWeight: '600', fontSize: 14 }}>＋ 月予算を設定する</Text>
          </TouchableOpacity>
        )}
      </View>

      {catData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>カテゴリ別</Text>
          {catData.map(({ cat, total }) => {
            const color = CAT_COLORS[cat as Category] ?? COLORS.gray400;
            const pct   = total / maxCat;
            const share = monthlyTotal > 0 ? Math.round((total / monthlyTotal) * 100) : 0;
            return (
              <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 }}>
                <Text style={{ fontSize: 12, color: COLORS.gray600, width: 52 }}>{cat}</Text>
                <View style={{ flex: 1, height: 10, backgroundColor: COLORS.gray100, borderRadius: 5, overflow: 'hidden' }}>
                  <View style={{ height: '100%', borderRadius: 5, width: `${pct * 100}%`, backgroundColor: color }} />
                </View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.gray900, width: 72, textAlign: 'right' }}>¥{total.toLocaleString()}</Text>
                <Text style={{ fontSize: 11, color: COLORS.gray400, width: 30, textAlign: 'right' }}>{share}%</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.listSectionLabel}>明細</Text>
      {expenses.length === 0 ? (
        <Empty icon="receipt-outline" text="この月の支出はまだありません" />
      ) : expenses.map(item => (
        <TouchableOpacity key={item.id} style={styles.row} onPress={() => onEdit(item)} activeOpacity={0.75}>
          <View style={[styles.dot, { backgroundColor: CAT_COLORS[item.category as Category] ?? COLORS.gray400 }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            {item.note ? <Text style={styles.rowMeta}>{item.note}</Text> : null}
            <Text style={styles.rowMeta}>{item.category ?? 'その他'} · {item.paid_at}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={styles.rowAmount}>¥{item.amount.toLocaleString()}</Text>
            <Text style={styles.rowEditHint}>タップで編集</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// サブスクタブ — ヘルパー
// ─────────────────────────────────────────────────────────────

function getSubAccentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  }
  return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length];
}

function DaysChip({ days }: { days: number }) {
  const urgent  = days <= 3;
  const warning = !urgent && days <= 7;
  const color   = urgent ? COLORS.danger : warning ? COLORS.warning : COLORS.gray500;
  const bg      = urgent ? COLORS.dangerLight : warning ? COLORS.warningLight : COLORS.gray100;
  return (
    <View style={[styles.daysChip, { backgroundColor: bg }]}>
      <Text style={[styles.daysChipText, { color }]}>
        {days === 0 ? '今日更新' : `あと ${days}日`}
      </Text>
    </View>
  );
}

function ServiceIcon({ name, accentColor }: { name: string; accentColor: string }) {
  const config = resolveServiceIcon(name);
  if (config) {
    return (
      <View style={[styles.serviceIconWrap, { backgroundColor: config.backgroundColor }]}>
        <Text style={styles.serviceIconEmoji}>{config.emoji}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.serviceIconWrap, { backgroundColor: accentColor }]}>
      <Text style={styles.serviceIconInitial}>{name.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function SubCard({ sub, onEdit, onDelete }: {
  sub: Subscription;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const days        = daysUntilRenewal(sub.renewal_day);
  const next        = getNextRenewalDate(sub.renewal_day);
  const nextStr     = `${next.getMonth() + 1}月${next.getDate()}日`;
  const accentColor = getSubAccentColor(sub.service_name);

  function handleLongPress() {
    Alert.alert(sub.service_name, '操作を選択してください', [
      { text: '編集', onPress: onEdit },
      {
        text: '削除', style: 'destructive',
        onPress: () =>
          Alert.alert('削除しますか？', sub.service_name, [
            { text: 'キャンセル', style: 'cancel' },
            { text: '削除', style: 'destructive', onPress: onDelete },
          ]),
      },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  }

  return (
    <TouchableOpacity
      style={styles.subCard}
      onPress={onEdit}
      onLongPress={handleLongPress}
      activeOpacity={0.75}
    >
      {/* Header: service icon + name (+ memo) */}
      <View style={styles.subCardHeader}>
        <ServiceIcon name={sub.service_name} accentColor={accentColor} />
        <View style={{ flex: 1 }}>
          <Text style={styles.subServiceName} numberOfLines={1}>{sub.service_name}</Text>
          {sub.memo ? <Text style={styles.subMemoText}>{sub.memo}</Text> : null}
        </View>
      </View>

      {/* Amount — hero */}
      <Text style={styles.subAmountHero}>
        ¥{sub.amount.toLocaleString()}
        <Text style={styles.subAmountUnit}> /月</Text>
      </Text>

      {/* Footer: next date + days badge */}
      <View style={styles.subCardFooter}>
        <Text style={styles.subRenewalText}>次回 {nextStr}</Text>
        <DaysChip days={days} />
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// サブスクタブ
// ─────────────────────────────────────────────────────────────
function SubscriptionsTab({ subscriptions, monthlyTotal, onEdit, onDelete }: {
  subscriptions: Subscription[]; monthlyTotal: number;
  onEdit: (s: Subscription) => void;
  onDelete: (id: string) => void;
}) {
  const nextSub = subscriptions.length > 0
    ? [...subscriptions].sort((a, b) => daysUntilRenewal(a.renewal_day) - daysUntilRenewal(b.renewal_day))[0]
    : null;
  const nextSubDate    = nextSub ? getNextRenewalDate(nextSub.renewal_day) : null;
  const nextSubDateStr = nextSubDate
    ? `${nextSubDate.getMonth() + 1}月${nextSubDate.getDate()}日`
    : '';
  const nextSubDays = nextSub ? daysUntilRenewal(nextSub.renewal_day) : 0;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* サマリーカード */}
      <View style={styles.summaryCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={styles.summarySubLabel}>月額合計</Text>
            <Text style={[styles.summaryAmount, { color: COLORS.primary }]}>
              ¥{monthlyTotal.toLocaleString()}
            </Text>
            <Text style={styles.subAnnualText}>
              年間 ¥{(monthlyTotal * 12).toLocaleString()}
            </Text>
          </View>
          <View style={[styles.summaryCountBadge, { backgroundColor: COLORS.primaryLight }]}>
            <Text style={[styles.summaryCountNum, { color: COLORS.primary }]}>{subscriptions.length}</Text>
            <Text style={[styles.summaryCountLabel, { color: COLORS.primary }]}>件</Text>
          </View>
        </View>

        {nextSub && (
          <>
            <View style={styles.subSummaryDivider} />
            <Text style={styles.subSummaryNextLabel}>次の支払い</Text>
            <View style={styles.subSummaryNextRow}>
              <View style={[styles.subSummaryNextDot, { backgroundColor: getSubAccentColor(nextSub.service_name) }]} />
              <Text style={styles.subSummaryNextName} numberOfLines={1}>
                {nextSub.service_name}
              </Text>
              <Text style={styles.subSummaryNextDate}>{nextSubDateStr}</Text>
              <DaysChip days={nextSubDays} />
            </View>
          </>
        )}
      </View>

      {/* サブスク一覧 */}
      {subscriptions.length === 0 ? (
        <Empty icon="reload-outline" text="サブスクが登録されていません" />
      ) : subscriptions.map(sub => (
        <SubCard
          key={sub.id}
          sub={sub}
          onEdit={() => onEdit(sub)}
          onDelete={() => onDelete(sub.id)}
        />
      ))}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// 収入タブ
// ─────────────────────────────────────────────────────────────
function IncomesTab({ incomes, monthlyTotal, monthLabel, onDelete }: {
  incomes: Database['public']['Tables']['incomes']['Row'][];
  monthlyTotal: number; monthLabel: string;
  onDelete: (id: string) => Promise<unknown>;
}) {
  // 種別ごとの合計（incomes はすでに選択月でフィルタ済み）
  const breakdown = useMemo(() => {
    const map: Record<string, number> = {};
    incomes.forEach(i => { map[i.income_type] = (map[i.income_type] ?? 0) + i.amount; });
    return Object.entries(map).map(([type, total]) => ({ type: type as IncomeType, total })).sort((a, b) => b.total - a.total);
  }, [incomes]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.summaryCard}>
        <Text style={styles.summarySubLabel}>{monthLabel}の収入</Text>
        <Text style={[styles.summaryAmount, { color: COLORS.success }]}>¥{monthlyTotal.toLocaleString()}</Text>
        {breakdown.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {breakdown.map(({ type, total }) => {
              const cfg = INCOME_TYPE_CONFIG[type];
              return (
                <View key={type} style={{ backgroundColor: COLORS.successLight, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ color: COLORS.success, fontSize: 12, fontWeight: '700' }}>{cfg.label} ¥{total.toLocaleString()}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Text style={styles.listSectionLabel}>収入履歴</Text>
      {incomes.length === 0 ? (
        <Empty icon="wallet-outline" text="この月の収入はまだありません" />
      ) : incomes.map(item => {
        const cfg = INCOME_TYPE_CONFIG[item.income_type];
        return (
          <View key={item.id} style={styles.row}>
            <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowMeta}>{cfg.label} · {item.received_at}</Text>
              {item.note ? <Text style={styles.rowMeta}>{item.note}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[styles.rowAmount, { color: COLORS.success }]}>+¥{item.amount.toLocaleString()}</Text>
              <TouchableOpacity
                style={styles.deleteRowBtn}
                onPress={() => Alert.alert(item.title, '削除しますか？', [
                  { text: 'キャンセル', style: 'cancel' },
                  { text: '削除', style: 'destructive', onPress: () => onDelete(item.id) },
                ])}
              >
                <Text style={styles.deleteRowBtnText}>削除</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// 給料タブ（集計・確認専用）
// ─────────────────────────────────────────────────────────────
function SalaryTab({
  workplaces, thisMonthShifts, allShifts, salaryRecords, monthLabel,
  onAddWorkplace, onEditWorkplace, onDeleteWorkplace, onAddSalary, onDeleteSalary,
}: {
  workplaces: Workplace[];
  thisMonthShifts: ShiftWithWorkplace[];
  allShifts: ShiftWithWorkplace[];
  salaryRecords: SalaryRecord[];
  monthLabel: string;
  onAddWorkplace: () => void;
  onEditWorkplace: (w: Workplace) => void;
  onDeleteWorkplace: (id: string) => void;
  onAddSalary: () => void;
  onDeleteSalary: (id: string) => void;
}) {
  const today = useMemo(() => localYMD(new Date()), []);

  // バイト先ごとの「次の給料」カード（シフトがある期間のみ表示）
  const nextPayCards = useMemo(() => workplaces.map(wp => {
    const period = getNextPayday(today, wp.closing_day ?? 31, wp.payday_month_offset ?? 1, wp.payday_day ?? 25);
    const ps = allShifts.filter(s =>
      s.workplace_id === wp.id &&
      s.date >= period.periodStart &&
      s.date <= period.periodEnd,
    );
    return {
      workplace: wp, period,
      count:        ps.length,
      totalMinutes: ps.reduce((sum, s) => sum + calcWorkMinutes(s.start_time, s.end_time, s.break_minutes), 0),
      totalWage:    ps.reduce((sum, s) => sum + (s.estimated_wage ?? 0), 0),
    };
  }).filter(c => c.count > 0), [workplaces, allShifts, today]);

  // 選択月のバイト先別内訳
  const monthSummaries = useMemo(() => workplaces.map(wp => {
    const ws = thisMonthShifts.filter(s => s.workplace_id === wp.id);
    return {
      workplace: wp,
      count:        ws.length,
      totalMinutes: ws.reduce((sum, s) => sum + calcWorkMinutes(s.start_time, s.end_time, s.break_minutes), 0),
      totalWage:    ws.reduce((sum, s) => sum + (s.estimated_wage ?? 0), 0),
    };
  }).filter(s => s.count > 0), [workplaces, thisMonthShifts]);

  const totalMinutes = thisMonthShifts.reduce((sum, s) => sum + calcWorkMinutes(s.start_time, s.end_time, s.break_minutes), 0);
  const totalWage    = thisMonthShifts.reduce((sum, s) => sum + (s.estimated_wage ?? 0), 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>

      {/* ── 次の給料 ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>次の給料</Text>
      </View>
      {workplaces.length === 0 ? (
        <Empty icon="business-outline" text="バイト先を登録してください" />
      ) : nextPayCards.length === 0 ? (
        <View style={[styles.card, { alignItems: 'center', paddingVertical: SPACING.lg }]}>
          <Text style={{ fontSize: 13, color: COLORS.gray400 }}>近い給与期間にシフトが登録されていません</Text>
          <Text style={{ fontSize: 11, color: COLORS.gray300, marginTop: 4 }}>予定画面からシフトを追加してください</Text>
        </View>
      ) : nextPayCards.map(({ workplace: wp, period, count, totalMinutes: mins, totalWage: wage }) => (
        <View key={wp.id} style={[styles.card, styles.nextPayCard, { borderLeftColor: wp.color }]}>
          {/* ヘッダー: バイト先名 + 入金予定日 */}
          <View style={styles.nextPayHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: wp.color }} />
              <Text style={styles.nextPayName}>{wp.name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.nextPaydayLabel}>入金予定</Text>
              <Text style={styles.nextPaydayDate}>{formatDateJP(period.payday)}</Text>
            </View>
          </View>
          {/* 入金予定額 */}
          <Text style={styles.nextPayAmount}>¥{wage.toLocaleString()}</Text>
          {/* 対象期間 */}
          <View style={styles.payInfoRow}>
            <Text style={styles.payInfoKey}>対象期間</Text>
            <Text style={styles.payInfoVal}>{formatDateJP(period.periodStart)} 〜 {formatDateJP(period.periodEnd)}</Text>
          </View>
          {/* 勤務回数・時間 */}
          <View style={styles.payInfoRow}>
            <Text style={styles.payInfoKey}>勤務</Text>
            <Text style={styles.payInfoVal}>{count}回{mins > 0 ? `　${formatMinutes(mins)}` : ''}</Text>
          </View>
        </View>
      ))}

      {/* ── 選択月の勤務サマリー ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{monthLabel}の勤務</Text>
      </View>
      {thisMonthShifts.length === 0 ? (
        <Empty icon="calendar-outline" text="この月のシフトはまだありません" />
      ) : (
        <View style={styles.summaryCard}>
          <Text style={styles.summarySubLabel}>合計給与見込み</Text>
          <Text style={[styles.summaryAmount, { color: '#6366F1' }]}>¥{totalWage.toLocaleString()}</Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
            <Text style={{ fontSize: 13, color: COLORS.gray500, fontWeight: '600' }}>{thisMonthShifts.length}回</Text>
            {totalMinutes > 0 && (
              <Text style={{ fontSize: 13, color: COLORS.gray500, fontWeight: '600' }}>{formatMinutes(totalMinutes)}</Text>
            )}
          </View>
          {/* バイト先別内訳（2件以上のとき） */}
          {monthSummaries.length > 1 && (
            <>
              <View style={styles.breakdownDivider} />
              {monthSummaries.map(({ workplace: wp, count, totalMinutes: mins, totalWage: wage }) => (
                <View key={wp.id} style={styles.breakdownRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: wp.color }} />
                    <Text style={styles.breakdownName}>{wp.name}</Text>
                  </View>
                  <Text style={styles.breakdownMeta}>{count}回</Text>
                  <Text style={styles.breakdownMeta}>{mins > 0 ? formatMinutes(mins) : '—'}</Text>
                  <Text style={styles.breakdownWage}>¥{wage.toLocaleString()}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {/* ── バイト先 ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>バイト先</Text>
        <TouchableOpacity style={styles.sectionAddBtn} onPress={onAddWorkplace}>
          <Text style={styles.sectionAddBtnText}>＋ 追加</Text>
        </TouchableOpacity>
      </View>
      {workplaces.length === 0 ? (
        <Empty icon="business-outline" text="バイト先を登録してください" />
      ) : workplaces.map(wp => (
        <TouchableOpacity key={wp.id} style={styles.card} onPress={() => onEditWorkplace(wp)} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.colorCircle, { backgroundColor: wp.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{wp.name}</Text>
              <Text style={styles.rowMeta}>{formatPaySchedule(wp.closing_day ?? 31, wp.payday_month_offset ?? 1, wp.payday_day ?? 25)}</Text>
              {wp.note ? <Text style={styles.rowMeta}>{wp.note}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.gray900 }}>¥{wp.hourly_wage.toLocaleString()}/h</Text>
              <TouchableOpacity style={styles.dangerSmall} onPress={() => onDeleteWorkplace(wp.id)}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.danger }}>削除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      ))}

      {/* ── 給与記録（実績） ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>給与記録（実績）</Text>
        <TouchableOpacity style={styles.sectionAddBtn} onPress={onAddSalary}>
          <Text style={styles.sectionAddBtnText}>＋ 追加</Text>
        </TouchableOpacity>
      </View>
      {salaryRecords.length === 0 ? (
        <Empty icon="document-text-outline" text="給与記録がありません" />
      ) : salaryRecords.map(r => (
        <View key={r.id} style={styles.row}>
          <Text style={{ fontSize: 22 }}>💴</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{r.workplace?.name ?? 'バイト'} {r.year_month}</Text>
            {r.note ? <Text style={styles.rowMeta}>{r.note}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={[styles.rowAmount, { color: COLORS.success }]}>+¥{r.amount.toLocaleString()}</Text>
            <TouchableOpacity style={styles.deleteRowBtn} onPress={() => onDeleteSalary(r.id)}>
              <Text style={styles.deleteRowBtnText}>削除</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// 共通ミニコンポーネント
// ─────────────────────────────────────────────────────────────
function ModalHeader({ title, onCancel, onSave, saveLabel, disabled }: {
  title: string; onCancel: () => void; onSave: () => void; saveLabel: string; disabled?: boolean;
}) {
  return (
    <View style={styles.modalHeader}>
      <TouchableOpacity onPress={onCancel}><Text style={styles.cancelText}>キャンセル</Text></TouchableOpacity>
      <Text style={styles.modalTitle}>{title}</Text>
      <TouchableOpacity onPress={onSave} disabled={disabled}><Text style={[styles.saveText, disabled && { opacity: 0.4 }]}>{saveLabel}</Text></TouchableOpacity>
    </View>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon as any} size={36} color="#D1D5DB" />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// カードタブ
// ─────────────────────────────────────────────────────────────
function CardsTab({ cards, expenses, onEdit, onDelete }: {
  cards: CreditCard[];
  expenses: Database['public']['Tables']['expenses']['Row'][];
  onEdit: (card: CreditCard) => void;
  onDelete: (id: string) => void;
}) {
  const today = new Date();

  if (cards.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Ionicons name="card-outline" size={48} color={COLORS.gray300} />
        <Text style={{ color: COLORS.gray400, fontSize: 15 }}>カードがありません</Text>
        <Text style={{ color: COLORS.gray300, fontSize: 13 }}>右上の「＋ 追加」で登録してください</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: SPACING.md, gap: SPACING.md }}>
      {cards.map(card => {
        const { periodStart, periodEnd } = getClosingPeriod(card, today);
        const payDate = getPaymentDate(card, today);
        const startYMD = localYMD(periodStart);
        const endYMD   = localYMD(periodEnd);
        const cardExpenses = expenses.filter(e => e.credit_card_id === card.id && e.paid_at >= startYMD && e.paid_at <= endYMD);
        const periodTotal  = cardExpenses.reduce((s, e) => s + e.amount, 0);
        const closingLabel = card.closing_day === 31 ? '末日' : `${card.closing_day}日`;
        const payLabel     = card.payment_day  === 31 ? '末日' : `${card.payment_day}日`;
        const payMonth = payDate.getMonth() + 1;
        const payDayNum = payDate.getDate();

        return (
          <TouchableOpacity key={card.id} onPress={() => onEdit(card)}
            style={{ backgroundColor: '#fff', borderRadius: RADIUS.lg, overflow: 'hidden', ...SHADOW.sm }}>
            {/* カードヘッダー */}
            <View style={{ backgroundColor: card.color, padding: SPACING.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{card.name}</Text>
                <Ionicons name="card" size={24} color="rgba(255,255,255,0.7)" />
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 6 }}>
                {closingLabel}締め → {card.payment_month_offset === 0 ? '当月' : '翌月'}{payLabel}払い
              </Text>
            </View>
            {/* 今期情報 */}
            <View style={{ padding: SPACING.md, gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 11, color: COLORS.gray400 }}>今期の利用合計</Text>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.gray900 }}>¥{periodTotal.toLocaleString()}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: COLORS.gray400 }}>引き落とし予定</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: card.color }}>{payMonth}月{payDayNum}日</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: COLORS.gray400 }}>
                集計期間: {startYMD} ～ {endYMD}（{cardExpenses.length}件）
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// 固定費タブ
// ─────────────────────────────────────────────────────────────
function FixedExpensesTab({
  fixedExpenses, monthlyTotal, annualTotal, onEdit, onDelete,
}: {
  fixedExpenses: FixedExpense[];
  monthlyTotal: number;
  annualTotal: number;
  onEdit: (fe: FixedExpense) => void;
  onDelete: (id: string) => void;
}) {
  const today = new Date();

  if (fixedExpenses.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Ionicons name="home-outline" size={48} color={COLORS.gray300} />
        <Text style={{ color: COLORS.gray400, fontSize: 15 }}>固定費がありません</Text>
        <Text style={{ color: COLORS.gray300, fontSize: 13 }}>右上の「＋ 追加」で登録してください</Text>
      </View>
    );
  }

  // 次回支払いが最も近い固定費
  const sorted = [...fixedExpenses].sort((a, b) =>
    getNextPaymentDate(a.payment_day, today).getTime() - getNextPaymentDate(b.payment_day, today).getTime(),
  );
  const next = sorted[0];
  const nextDate = getNextPaymentDate(next.payment_day, today);
  const nextDef  = getCategoryDef(next.category);

  // カテゴリ別集計
  const catTotals: Record<string, number> = {};
  for (const fe of fixedExpenses) {
    catTotals[fe.category] = (catTotals[fe.category] ?? 0) + fe.amount;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: SPACING.md, gap: SPACING.md }}>
      {/* サマリーカード */}
      <View style={{ backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm, ...SHADOW.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 12, color: COLORS.gray400 }}>今月の固定費合計</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: COLORS.gray900 }}>¥{monthlyTotal.toLocaleString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 12, color: COLORS.gray400 }}>年間固定費</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.gray700 }}>¥{annualTotal.toLocaleString()}</Text>
          </View>
        </View>
        <View style={{ height: 0.5, backgroundColor: COLORS.gray100 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={nextDef.icon as any} size={16} color={nextDef.color} />
          <Text style={{ fontSize: 13, color: COLORS.gray500 }}>
            次回: {next.name}（¥{next.amount.toLocaleString()}）— {nextDate.getMonth()+1}月{nextDate.getDate()}日
          </Text>
        </View>
      </View>

      {/* カテゴリ別内訳 */}
      <View style={{ backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOW.sm }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray700, marginBottom: SPACING.sm }}>カテゴリ別内訳</Text>
        {FIXED_EXPENSE_CATEGORIES.filter(cat => catTotals[cat.key]).map(cat => {
          const total = catTotals[cat.key]!;
          const pct   = monthlyTotal > 0 ? total / monthlyTotal : 0;
          return (
            <View key={cat.key} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={cat.icon as any} size={14} color={cat.color} />
                  <Text style={{ fontSize: 13, color: COLORS.gray700 }}>{cat.label}</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.gray900 }}>¥{total.toLocaleString()}</Text>
              </View>
              <View style={{ height: 4, backgroundColor: COLORS.gray100, borderRadius: 2 }}>
                <View style={{ height: 4, width: `${Math.round(pct * 100)}%`, backgroundColor: cat.color, borderRadius: 2 }} />
              </View>
            </View>
          );
        })}
      </View>

      {/* 固定費一覧 */}
      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.gray600, marginTop: SPACING.xs }}>支払日順</Text>
      {fixedExpenses.map(fe => {
        const def      = getCategoryDef(fe.category);
        const nextPay  = getNextPaymentDate(fe.payment_day, today);
        const dayLabel = fe.payment_day === 31 ? '末日' : `${fe.payment_day}日`;
        return (
          <TouchableOpacity key={fe.id} onPress={() => onEdit(fe)}
            style={{ backgroundColor: COLORS.white, borderRadius: RADIUS.lg, flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.sm, ...SHADOW.sm }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: def.color + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={def.icon as any} size={20} color={def.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.gray900 }}>{fe.name}</Text>
              <Text style={{ fontSize: 12, color: COLORS.gray400 }}>毎月{dayLabel} — 次回 {nextPay.getMonth()+1}月{nextPay.getDate()}日</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.gray900 }}>¥{fe.amount.toLocaleString()}</Text>
              <Text style={{ fontSize: 11, color: COLORS.gray400 }}>{def.label}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// スタイル
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 4 },
  title:  { fontSize: 22, fontWeight: '800', color: COLORS.gray900 },

  outlineBtn:     { borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 4, paddingVertical: SPACING.xs + 2 },
  outlineBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  primaryBtn:     { backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md - 2, paddingVertical: SPACING.xs + 3 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // 月ナビゲーター
  monthNav:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 4, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  monthNavBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthNavCenter:  { flex: 1, alignItems: 'center', paddingVertical: 4 },
  monthNavText:    { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  monthNavBackText:{ fontSize: 11, color: COLORS.primary, fontWeight: '600', marginTop: 2 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
    paddingHorizontal: SPACING.sm + 4,
    paddingVertical: SPACING.xs + 2,
    gap: SPACING.sm,
  },
  tabItem:       { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 3, borderRadius: RADIUS.full, backgroundColor: COLORS.gray100 },
  tabItemActive: { backgroundColor: COLORS.primary },
  tabText:       { fontSize: 14, fontWeight: '600', color: COLORS.gray600 },
  tabTextActive: { color: '#fff' },
  tabAddBtn:     { paddingHorizontal: 6, paddingVertical: SPACING.xs + 3, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },

  // サマリーカード（全タブ共通・白地）
  summaryCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm + 4,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOW.sm,
  },
  summarySubLabel:   { fontSize: 13, color: COLORS.gray400, marginBottom: SPACING.xs },
  summaryAmount:     { fontSize: 36, fontWeight: '800', color: COLORS.gray900 },
  summaryCountBadge: { borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', minWidth: 64 },
  summaryCountNum:   { fontSize: 28, fontWeight: '800' },
  summaryCountLabel: { fontSize: 12, fontWeight: '600' },

  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg, padding: SPACING.md,
    ...SHADOW.sm,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray900, marginBottom: 2 },

  listSectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.gray600, paddingHorizontal: SPACING.md, marginBottom: 6, marginTop: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm + 2,
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md, marginBottom: SPACING.xs + 2,
    borderRadius: RADIUS.md, padding: SPACING.sm + 4,
    ...SHADOW.sm,
  },
  rowTitle:  { fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  rowMeta:   { fontSize: 11, color: COLORS.gray400, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '700', color: COLORS.gray900 },

  dot: { width: 10, height: 10, borderRadius: 5 },

  // プログレスバー：高さを太くして視認性アップ
  progressBar:  { height: 12, backgroundColor: COLORS.gray100, borderRadius: RADIUS.sm, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: RADIUS.sm },

  sectionHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  sectionTitle:      { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  sectionAddBtn:     { backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm + 4, paddingVertical: 5 },
  sectionAddBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  wagePreview:         { backgroundColor: COLORS.successLight, borderRadius: RADIUS.md, padding: SPACING.md, marginVertical: SPACING.sm + 2, alignItems: 'center' },
  wagePreviewLabel:    { fontSize: 12, color: COLORS.success, fontWeight: '600' },
  wagePreviewWage:     { fontSize: 28, fontWeight: '800', color: COLORS.success },
  wagePreviewDuration: { fontSize: 12, color: COLORS.success, marginTop: 2 },

  colorCircle:         { width: 32, height: 32, borderRadius: 16 },
  colorCircleSelected: { borderWidth: 3, borderColor: COLORS.gray900 },

  dangerSmall: { paddingHorizontal: SPACING.md, paddingVertical: 11, borderRadius: RADIUS.sm, backgroundColor: COLORS.dangerLight },

  // 行内削除ボタン（常時表示）
  deleteRowBtn:     { paddingHorizontal: SPACING.sm + 2, paddingVertical: 10, borderRadius: RADIUS.sm, backgroundColor: COLORS.dangerLight },
  deleteRowBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.danger },

  // 支出行の編集ヒント
  rowEditHint: { fontSize: 10, color: COLORS.gray300, marginTop: 2 },

  // ── 次の給料カード ────────────────────────────────────────
  nextPayCard: {
    borderLeftWidth: 4,
    paddingLeft: SPACING.md,
  },
  nextPayHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   10,
  },
  nextPayName:      { fontSize: 15, fontWeight: '700', color: COLORS.gray900 },
  nextPaydayLabel:  { fontSize: 10, color: COLORS.gray400, fontWeight: '600', textAlign: 'right' },
  nextPaydayDate:   { fontSize: 13, fontWeight: '700', color: '#6366F1', textAlign: 'right' },
  nextPayAmount:    { fontSize: 30, fontWeight: '800', color: COLORS.gray900, marginBottom: 10 },
  payInfoRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  payInfoKey:       { fontSize: 11, color: COLORS.gray400, fontWeight: '600', width: 52 },
  payInfoVal:       { fontSize: 12, color: COLORS.gray600, fontWeight: '500', flex: 1 },

  // ── 勤務サマリー内訳 ──────────────────────────────────────
  breakdownDivider: { height: 1, backgroundColor: COLORS.gray100, marginTop: 14, marginBottom: 10 },
  breakdownRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 6 },
  breakdownName:    { fontSize: 13, fontWeight: '600', color: COLORS.gray700, flex: 1 },
  breakdownMeta:    { fontSize: 12, color: COLORS.gray500, width: 60, textAlign: 'right' },
  breakdownWage:    { fontSize: 13, fontWeight: '700', color: COLORS.gray900, width: 72, textAlign: 'right' },

  // モーダル内削除ボタン
  deleteModalBtn:     { marginTop: SPACING.lg, marginBottom: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: '#FEF2F2', alignItems: 'center' },
  deleteModalBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.danger },

  empty:     { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  emptyText: { fontSize: 14, color: COLORS.gray400 },

  modal:       { flex: 1, backgroundColor: COLORS.white },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 6, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  modalTitle:  { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  cancelText:  { fontSize: 16, color: COLORS.gray600 },
  saveText:    { fontSize: 16, fontWeight: '700', color: COLORS.primary },

  inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.gray600, marginBottom: 6, marginTop: SPACING.md },
  input:      { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: RADIUS.sm + 2, padding: SPACING.sm + 4, fontSize: 16, backgroundColor: COLORS.gray50 },
  chip:       { borderWidth: 2, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md - 2, paddingVertical: SPACING.xs + 3 },
  chipText:   { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },

  dayBtn:           { width: 40, height: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  dayBtnActive:     { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayBtnText:       { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  dayBtnTextActive: { color: '#fff' },

  dateTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 6, paddingVertical: SPACING.sm + 4, marginBottom: 4,
    backgroundColor: COLORS.primaryLight,
  },
  dateTriggerIcon:    { fontSize: 16 },
  dateTriggerText:    { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.primary },
  dateTriggerChevron: { fontSize: 18, color: COLORS.primary },

  // ── サブスクカード ────────────────────────────────────────
  subCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm + 2,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg - 4,
    ...SHADOW.md,
  },
  subCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    marginBottom: SPACING.sm + 4,
  },
  subAccentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  subServiceName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.gray900,
  },
  subMemoText: {
    fontSize: 11,
    color: COLORS.gray400,
    marginTop: 2,
  },
  subAmountHero: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.gray900,
    marginBottom: SPACING.md,
  },
  subAmountUnit: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.gray400,
  },
  subCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subRenewalText: {
    fontSize: 13,
    color: COLORS.gray500,
    fontWeight: '500',
  },

  // ── 日数バッジ ────────────────────────────────────────────
  daysChip: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 1,
  },
  daysChipText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── サブスクサマリー追加要素 ──────────────────────────────
  subAnnualText: {
    fontSize: 12,
    color: COLORS.gray400,
    marginTop: 4,
  },
  subSummaryDivider: {
    height: 1,
    backgroundColor: COLORS.gray100,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm + 4,
  },
  subSummaryNextLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray400,
    letterSpacing: 0.4,
    marginBottom: SPACING.xs + 2,
  },
  subSummaryNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
  },
  subSummaryNextDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  subSummaryNextName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray700,
    flex: 1,
  },
  subSummaryNextDate: {
    fontSize: 13,
    color: COLORS.gray500,
    marginRight: SPACING.xs,
  },

  // ── サービスアイコン ──────────────────────────────────────
  serviceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  serviceIconEmoji: {
    fontSize: 20,
  },
  serviceIconInitial: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
