import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import InlineDatePicker from '@/components/InlineDatePicker';
import InlineTimePicker from '@/components/InlineTimePicker';
import { COLORS } from '@/constants/theme';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes, INCOME_TYPE_CONFIG } from '@/hooks/useIncomes';
import { useShifts, calcWage, formatMinutes, calcWorkMinutes } from '@/hooks/useShifts';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { useWorkplaces, WORKPLACE_COLORS } from '@/hooks/useWorkplaces';
import { daysUntilRenewal, getNextRenewalDate } from '@/lib/notifications';
import type { Database, IncomeType } from '@/types/database';

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

// ── 収支タブ型 ─────────────────────────────────────────────
type MoneyTab = 'expenses' | 'subscriptions' | 'incomes' | 'salary';

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
  const { expenses, isLoading: expLoading, addExpense, deleteExpense, monthlyTotal: expTotal } = useExpenses();
  const { subscriptions, isLoading: subLoading, addSubscription, updateSubscription, deleteSubscription, monthlyTotal: subTotal } = useSubscriptions();
  const { incomes, salaryRecords: salaryRecordsRaw, isLoading: incLoading, addIncome, deleteIncome, addSalaryRecord, deleteSalaryRecord } = useIncomes();
  const { workplaces, isLoading: wpLoading, addWorkplace, updateWorkplace, deleteWorkplace } = useWorkplaces();
  const { shifts, isLoading: shiftLoading, addShift, deleteShift, getForMonth, getMonthlyEstimate } = useShifts();

  const salaryRecords = salaryRecordsRaw as unknown as SalaryRecord[];

  const [tab, setTab] = useState<MoneyTab>('expenses');

  // ── 今月 ──
  const now       = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const thisYM    = `${thisYear}-${String(thisMonth).padStart(2, '0')}`;
  const monthLabel = `${thisYear}年${thisMonth}月`;

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

  // ── 支出追加モーダル ──────────────────────────────────────
  const [addExpModal, setAddExpModal] = useState(false);
  const [expTitle, setExpTitle]       = useState('');
  const [expAmount, setExpAmount]     = useState('');
  const [expCat, setExpCat]           = useState<Category>('食費');
  const [expDate, setExpDate]         = useState(now.toISOString().split('T')[0]);
  const [expMemo, setExpMemo]         = useState('');
  const [expSaving, setExpSaving]     = useState(false);

  async function handleAddExpense() {
    const amount = parseInt(expAmount, 10);
    if (!expTitle.trim() || isNaN(amount) || amount <= 0) {
      Alert.alert('入力エラー', '内容と金額を入力してください'); return;
    }
    setExpSaving(true);
    const err = await addExpense({ title: expTitle.trim(), amount, category: expCat, paid_at: expDate, note: expMemo.trim() || null });
    setExpSaving(false);
    if (err) Alert.alert('エラー', err.message); else setAddExpModal(false);
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
    if (isNaN(day) || day < 1 || day > 28) { Alert.alert('入力エラー', '更新日は1〜28で入力してください'); return; }
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
  const [incDate, setIncDate]             = useState(thisYM + '-25');
  const [incMemo, setIncMemo]             = useState('');
  const [incSaving, setIncSaving]         = useState(false);

  function openAddIncModal() {
    setIncType('salary'); setIncTitle(''); setIncAmount(''); setIncDate(thisYM + '-25'); setIncMemo('');
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
  const [wpModal, setWpModal]         = useState(false);
  const [editingWp, setEditingWp]     = useState<Workplace | null>(null);
  const [wpName, setWpName]           = useState('');
  const [wpWage, setWpWage]           = useState('');
  const [wpColor, setWpColor]         = useState<string>(WORKPLACE_COLORS[0]);
  const [wpNote, setWpNote]           = useState('');
  const [wpSaving, setWpSaving]       = useState(false);

  function openWpModal(wp?: Workplace) {
    if (wp) { setEditingWp(wp); setWpName(wp.name); setWpWage(String(wp.hourly_wage)); setWpColor(wp.color); setWpNote(wp.note ?? ''); }
    else    { setEditingWp(null); setWpName(''); setWpWage(''); setWpColor(WORKPLACE_COLORS[0]); setWpNote(''); }
    setWpModal(true);
  }
  async function handleSaveWorkplace() {
    const wage = parseInt(wpWage, 10);
    if (!wpName.trim()) { Alert.alert('入力エラー', 'バイト先名を入力してください'); return; }
    if (isNaN(wage) || wage <= 0) { Alert.alert('入力エラー', '時給を入力してください'); return; }
    setWpSaving(true);
    const payload = { name: wpName.trim(), hourly_wage: wage, color: wpColor, note: wpNote.trim() || null, is_active: true };
    const err = editingWp ? await updateWorkplace(editingWp.id, payload) : await addWorkplace(payload);
    setWpSaving(false);
    if (err) Alert.alert('エラー', err.message); else setWpModal(false);
  }

  // ── シフト追加モーダル ────────────────────────────────────
  const [shiftModal, setShiftModal]   = useState(false);
  const [sfWpId, setSfWpId]           = useState('');
  const [sfDate, setSfDate]           = useState(now.toISOString().split('T')[0]);
  const [sfStart, setSfStart]         = useState('09:00');
  const [sfEnd, setSfEnd]             = useState('18:00');
  const [sfBreak, setSfBreak]         = useState('60');
  const [sfNote, setSfNote]           = useState('');
  const [sfSaving, setSfSaving]       = useState(false);

  function openShiftModal() {
    setSfWpId(workplaces[0]?.id ?? '');
    setSfDate(now.toISOString().split('T')[0]);
    setSfStart('09:00'); setSfEnd('18:00'); setSfBreak('60'); setSfNote('');
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

  async function handleAddShift() {
    if (!sfWpId) { Alert.alert('入力エラー', 'バイト先を選択してください'); return; }
    const wp = workplaces.find(w => w.id === sfWpId);
    if (!wp) return;
    setSfSaving(true);
    const err = await addShift({ workplace_id: sfWpId, date: sfDate, start_time: sfStart, end_time: sfEnd, break_minutes: parseInt(sfBreak, 10) || 0, note: sfNote.trim() || null }, wp.hourly_wage);
    setSfSaving(false);
    if (err) Alert.alert('エラー', err.message); else setShiftModal(false);
  }

  // ── 給与記録追加モーダル ──────────────────────────────────
  const [salaryModal, setSalaryModal] = useState(false);
  const [salWpId, setSalWpId]         = useState('');
  const [salYM, setSalYM]             = useState(thisYM);
  const [salAmount, setSalAmount]     = useState('');
  const [salNote, setSalNote]         = useState('');
  const [salSaving, setSalSaving]     = useState(false);

  function openSalaryModal() {
    setSalWpId(workplaces[0]?.id ?? ''); setSalYM(thisYM); setSalAmount(''); setSalNote('');
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

  // ── 集計 ──────────────────────────────────────────────────
  const remaining  = budget !== null ? budget - expTotal : null;
  const usageRate  = budget ? Math.min(expTotal / budget, 1) : 0;
  const overBudget = budget !== null && expTotal > budget;
  const catData    = aggregateByCategory(expenses);
  const maxCat     = catData[0]?.total ?? 1;

  const monthlyIncomeTotal = incomes.filter(i => i.received_at.startsWith(thisYM)).reduce((s, i) => s + i.amount, 0);
  const thisMonthShifts    = getForMonth(thisYear, thisMonth);
  const monthlyEstimate    = getMonthlyEstimate(thisYear, thisMonth);

  const isLoading = expLoading || subLoading || incLoading || wpLoading || shiftLoading;

  // ── FAB押下 ──────────────────────────────────────────────
  function handleAdd() {
    if (tab === 'expenses')      { setExpTitle(''); setExpAmount(''); setExpCat('食費'); setExpDate(now.toISOString().split('T')[0]); setExpMemo(''); setAddExpModal(true); }
    else if (tab === 'subscriptions') openSubModal();
    else if (tab === 'incomes')  openAddIncModal();
    else if (tab === 'salary')   openShiftModal();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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

      {/* ── サブタブ ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabContainer}>
        {([
          ['expenses', '支出'], ['subscriptions', 'サブスク'], ['incomes', '収入'], ['salary', '給料'],
        ] as [MoneyTab, string][]).map(([key, label]) => (
          <TouchableOpacity key={key} style={[styles.tabItem, tab === key && styles.tabItemActive]} onPress={() => setTab(key)}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      ) : (
        <>
          {tab === 'expenses'      && <ExpensesTab {...{ expenses, monthlyTotal: expTotal, budget, remaining, usageRate, overBudget, catData, maxCat, deleteExpense, monthLabel }} onSetBudget={() => { setBudgetInput(''); setBudgetModal(true); }} />}
          {tab === 'subscriptions' && <SubscriptionsTab {...{ subscriptions, monthlyTotal: subTotal }} onEdit={openSubModal} onDelete={id => deleteSubscription(id)} />}
          {tab === 'incomes'       && <IncomesTab {...{ incomes, monthlyTotal: monthlyIncomeTotal, thisYM, monthLabel }} onDelete={deleteIncome} />}
          {tab === 'salary'        && <SalaryTab {...{ workplaces, monthlyEstimate, thisMonthShifts, salaryRecords, monthLabel }} onAddWorkplace={() => openWpModal()} onEditWorkplace={openWpModal} onDeleteWorkplace={(id) => Alert.alert('削除', 'バイト先を削除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => deleteWorkplace(id) }])} onAddShift={openShiftModal} onDeleteShift={id => Alert.alert('削除', 'シフトを削除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => deleteShift(id) }])} onAddSalary={openSalaryModal} onDeleteSalary={id => Alert.alert('削除', '給与記録を削除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => deleteSalaryRecord(id) }])} />}
        </>
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

      {/* 支出追加 */}
      <Modal visible={addExpModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ModalHeader title="支出を追加" onCancel={() => setAddExpModal(false)} onSave={handleAddExpense} saveLabel={expSaving ? '保存中...' : '追加'} disabled={expSaving} />
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
              <Text style={styles.inputLabel}>メモ（任意）</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="例: 友達とランチ" value={expMemo} onChangeText={setExpMemo} multiline />
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
              <Text style={styles.inputLabel}>更新日 *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
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
                    <Text style={[styles.chipText, incType === k && { color: '#fff' }]}>{cfg.emoji} {cfg.label}</Text>
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
            <ModalHeader title="シフトを追加" onCancel={() => setShiftModal(false)} onSave={handleAddShift} saveLabel={sfSaving ? '保存中...' : '追加'} disabled={sfSaving} />
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {workplaces.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={{ fontSize: 36 }}>🏢</Text>
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
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// 支出タブ
// ─────────────────────────────────────────────────────────────
function ExpensesTab({ expenses, monthlyTotal, budget, remaining, usageRate, overBudget, catData, maxCat, deleteExpense, monthLabel, onSetBudget }: {
  expenses: Database['public']['Tables']['expenses']['Row'][];
  monthlyTotal: number; budget: number | null; remaining: number | null;
  usageRate: number; overBudget: boolean;
  catData: { cat: string; total: number }[]; maxCat: number;
  deleteExpense: (id: string) => Promise<unknown>;
  monthLabel: string; onSetBudget: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
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
        <Empty emoji="💰" text="今月の支出はまだありません" />
      ) : expenses.map(item => (
        <TouchableOpacity key={item.id} style={styles.row} onLongPress={() => Alert.alert(item.title, '削除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => deleteExpense(item.id) }])}>
          <View style={[styles.dot, { backgroundColor: CAT_COLORS[item.category as Category] ?? COLORS.gray400 }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.title}</Text>
            {item.note ? <Text style={styles.rowMeta}>{item.note}</Text> : null}
            <Text style={styles.rowMeta}>{item.category ?? 'その他'} · {item.paid_at}</Text>
          </View>
          <Text style={styles.rowAmount}>¥{item.amount.toLocaleString()}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
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
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={[styles.summaryCard, { backgroundColor: COLORS.primary }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>月額合計</Text>
            <Text style={{ fontSize: 32, fontWeight: '800', color: '#fff' }}>¥{monthlyTotal.toLocaleString()}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>年間 ¥{(monthlyTotal * 12).toLocaleString()}</Text>
          </View>
          <View style={{ alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: 14 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff' }}>{subscriptions.length}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>件</Text>
          </View>
        </View>
      </View>

      {subscriptions.length === 0 ? (
        <Empty emoji="🔄" text="サブスクが登録されていません" />
      ) : subscriptions.map(sub => {
        const days    = daysUntilRenewal(sub.renewal_day);
        const next    = getNextRenewalDate(sub.renewal_day);
        const nextStr = `${next.getMonth() + 1}/${next.getDate()}`;
        const badgeColor = days <= 3 ? COLORS.danger : days <= 7 ? COLORS.warning : COLORS.gray400;
        const badgeBg    = days <= 3 ? COLORS.dangerLight : days <= 7 ? COLORS.warningLight : COLORS.gray100;
        return (
          <TouchableOpacity key={sub.id} style={styles.card} onPress={() => onEdit(sub)} activeOpacity={0.8}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.cardTitle}>{sub.service_name}</Text>
                {sub.memo ? <Text style={styles.rowMeta}>{sub.memo}</Text> : null}
                <Text style={styles.rowMeta}>毎月{sub.renewal_day}日（次回 {nextStr}）</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.gray900 }}>¥{sub.amount.toLocaleString()}<Text style={{ fontSize: 12, fontWeight: '400', color: COLORS.gray400 }}>/月</Text></Text>
                <View style={[{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }, { backgroundColor: badgeBg }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: badgeColor }}>{days === 0 ? '今日更新' : `あと${days}日`}</Text>
                </View>
                <TouchableOpacity style={styles.dangerSmall} onPress={() => Alert.alert(sub.service_name, '削除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => onDelete(sub.id) }])}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.danger }}>削除</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// 収入タブ
// ─────────────────────────────────────────────────────────────
function IncomesTab({ incomes, monthlyTotal, thisYM, monthLabel, onDelete }: {
  incomes: Database['public']['Tables']['incomes']['Row'][];
  monthlyTotal: number; thisYM: string; monthLabel: string;
  onDelete: (id: string) => Promise<unknown>;
}) {
  // 種別ごとの今月合計
  const breakdown = useMemo(() => {
    const map: Record<string, number> = {};
    incomes.filter(i => i.received_at.startsWith(thisYM)).forEach(i => {
      map[i.income_type] = (map[i.income_type] ?? 0) + i.amount;
    });
    return Object.entries(map).map(([type, total]) => ({ type: type as IncomeType, total })).sort((a, b) => b.total - a.total);
  }, [incomes, thisYM]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={[styles.summaryCard, { backgroundColor: '#10B981' }]}>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>{monthLabel}の収入</Text>
        <Text style={{ fontSize: 36, fontWeight: '800', color: '#fff' }}>¥{monthlyTotal.toLocaleString()}</Text>
        {breakdown.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {breakdown.map(({ type, total }) => {
              const cfg = INCOME_TYPE_CONFIG[type];
              return (
                <View key={type} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{cfg.emoji} {cfg.label} ¥{total.toLocaleString()}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Text style={styles.listSectionLabel}>収入履歴</Text>
      {incomes.length === 0 ? (
        <Empty emoji="💰" text="収入がまだ登録されていません" />
      ) : incomes.map(item => {
        const cfg = INCOME_TYPE_CONFIG[item.income_type];
        return (
          <TouchableOpacity key={item.id} style={styles.row} onLongPress={() => Alert.alert(item.title, '削除しますか？', [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => onDelete(item.id) }])}>
            <Text style={{ fontSize: 22 }}>{cfg.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowMeta}>{cfg.label} · {item.received_at}</Text>
              {item.note ? <Text style={styles.rowMeta}>{item.note}</Text> : null}
            </View>
            <Text style={[styles.rowAmount, { color: COLORS.success }]}>+¥{item.amount.toLocaleString()}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// 給料タブ
// ─────────────────────────────────────────────────────────────
function SalaryTab({ workplaces, monthlyEstimate, thisMonthShifts, salaryRecords, monthLabel, onAddWorkplace, onEditWorkplace, onDeleteWorkplace, onAddShift, onDeleteShift, onAddSalary, onDeleteSalary }: {
  workplaces: Workplace[];
  monthlyEstimate: number;
  thisMonthShifts: import('@/hooks/useShifts').ShiftWithWorkplace[];
  salaryRecords: SalaryRecord[];
  monthLabel: string;
  onAddWorkplace: () => void;
  onEditWorkplace: (w: Workplace) => void;
  onDeleteWorkplace: (id: string) => void;
  onAddShift: () => void;
  onDeleteShift: (id: string) => void;
  onAddSalary: () => void;
  onDeleteSalary: (id: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      {/* 今月見込み */}
      <View style={[styles.summaryCard, { backgroundColor: '#6366F1' }]}>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>{monthLabel}の給与見込み</Text>
        <Text style={{ fontSize: 36, fontWeight: '800', color: '#fff' }}>¥{monthlyEstimate.toLocaleString()}</Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>シフト {thisMonthShifts.length}件</Text>
      </View>

      {/* バイト先一覧 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>バイト先</Text>
        <TouchableOpacity style={styles.sectionAddBtn} onPress={onAddWorkplace}>
          <Text style={styles.sectionAddBtnText}>＋ 追加</Text>
        </TouchableOpacity>
      </View>
      {workplaces.length === 0 ? (
        <Empty emoji="🏢" text="バイト先を登録してください" />
      ) : workplaces.map(wp => (
        <TouchableOpacity key={wp.id} style={styles.card} onPress={() => onEditWorkplace(wp)} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.colorCircle, { backgroundColor: wp.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{wp.name}</Text>
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

      {/* 今月のシフト */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{monthLabel}のシフト</Text>
        <TouchableOpacity style={styles.sectionAddBtn} onPress={onAddShift}>
          <Text style={styles.sectionAddBtnText}>＋ 追加</Text>
        </TouchableOpacity>
      </View>
      {thisMonthShifts.length === 0 ? (
        <Empty emoji="📅" text="シフトがありません" />
      ) : thisMonthShifts.map(s => (
        <TouchableOpacity key={s.id} style={[styles.row, { borderLeftWidth: 3, borderLeftColor: s.workplace?.color ?? COLORS.primary }]} onLongPress={() => onDeleteShift(s.id)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{s.workplace?.name ?? 'バイト'}</Text>
            <Text style={styles.rowMeta}>{s.date}  {s.start_time} 〜 {s.end_time}</Text>
            {s.note ? <Text style={styles.rowMeta}>{s.note}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.gray900 }}>¥{(s.estimated_wage ?? 0).toLocaleString()}</Text>
            <Text style={styles.rowMeta}>{formatMinutes(calcWorkMinutes(s.start_time, s.end_time, s.break_minutes))}</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* 給与記録 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>給与記録（実績）</Text>
        <TouchableOpacity style={styles.sectionAddBtn} onPress={onAddSalary}>
          <Text style={styles.sectionAddBtnText}>＋ 追加</Text>
        </TouchableOpacity>
      </View>
      {salaryRecords.length === 0 ? (
        <Empty emoji="📋" text="給与記録がありません" />
      ) : salaryRecords.map(r => (
        <TouchableOpacity key={r.id} style={styles.row} onLongPress={() => onDeleteSalary(r.id)}>
          <Text style={{ fontSize: 22 }}>💴</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{r.workplace?.name ?? 'バイト'} {r.year_month}</Text>
            {r.note ? <Text style={styles.rowMeta}>{r.note}</Text> : null}
          </View>
          <Text style={[styles.rowAmount, { color: COLORS.success }]}>+¥{r.amount.toLocaleString()}</Text>
        </TouchableOpacity>
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

function Empty({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// スタイル
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  title:  { fontSize: 22, fontWeight: '800', color: COLORS.gray900 },

  outlineBtn:     { borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  outlineBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  primaryBtn:     { backgroundColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  tabScroll:     { maxHeight: 48 },
  tabContainer:  { paddingHorizontal: 12, gap: 8, alignItems: 'center', paddingVertical: 6 },
  tabItem:       { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.gray100 },
  tabItemActive: { backgroundColor: COLORS.primary },
  tabText:       { fontSize: 14, fontWeight: '600', color: COLORS.gray600 },
  tabTextActive: { color: '#fff' },

  summaryCard: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 12,
    backgroundColor: COLORS.white, borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  summarySubLabel: { fontSize: 13, color: COLORS.gray400, marginBottom: 4 },
  summaryAmount:   { fontSize: 36, fontWeight: '800', color: COLORS.gray900 },

  card: {
    backgroundColor: COLORS.white, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray900, marginBottom: 2 },

  listSectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.gray600, paddingHorizontal: 16, marginBottom: 6, marginTop: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.white, marginHorizontal: 16, marginBottom: 6,
    borderRadius: 12, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  rowTitle:  { fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  rowMeta:   { fontSize: 11, color: COLORS.gray400, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '700', color: COLORS.gray900 },

  dot: { width: 10, height: 10, borderRadius: 5 },

  progressBar:  { height: 8, backgroundColor: COLORS.gray100, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },

  sectionHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  sectionTitle:     { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  sectionAddBtn:    { backgroundColor: COLORS.primaryLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
  sectionAddBtnText:{ fontSize: 13, fontWeight: '700', color: COLORS.primary },

  wagePreview:        { backgroundColor: COLORS.successLight, borderRadius: 12, padding: 14, marginVertical: 10, alignItems: 'center' },
  wagePreviewLabel:   { fontSize: 12, color: COLORS.success, fontWeight: '600' },
  wagePreviewWage:    { fontSize: 28, fontWeight: '800', color: COLORS.success },
  wagePreviewDuration:{ fontSize: 12, color: COLORS.success, marginTop: 2 },

  colorCircle:         { width: 32, height: 32, borderRadius: 16 },
  colorCircleSelected: { borderWidth: 3, borderColor: COLORS.gray900 },

  dangerSmall: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: COLORS.dangerLight },

  empty:     { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.gray400 },

  modal:       { flex: 1, backgroundColor: COLORS.white },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  modalTitle:  { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  cancelText:  { fontSize: 16, color: COLORS.gray600 },
  saveText:    { fontSize: 16, fontWeight: '700', color: COLORS.primary },

  inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.gray600, marginBottom: 6, marginTop: 16 },
  input:      { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: COLORS.gray50 },
  chip:       { borderWidth: 2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  chipText:   { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },

  dayBtn:         { width: 40, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  dayBtnActive:   { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayBtnText:     { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  dayBtnTextActive: { color: '#fff' },

  dateTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4,
    backgroundColor: COLORS.primaryLight,
  },
  dateTriggerIcon:    { fontSize: 16 },
  dateTriggerText:    { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.primary },
  dateTriggerChevron: { fontSize: 18, color: COLORS.primary },
});
