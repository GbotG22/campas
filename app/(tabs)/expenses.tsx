import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';
import { useExpenses } from '@/hooks/useExpenses';
import { useCategories } from '@/hooks/useCategories';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { daysUntilRenewal, getNextRenewalDate } from '@/lib/notifications';
import { localYMD } from '@/lib/dateUtils';
import type { Database } from '@/types/database';

// Build 50: 支出カテゴリは user_categories（useCategories）が単一の真実

const BUDGET_KEY = 'campas_monthly_budget';
type TabType = 'expenses' | 'subscriptions';
type Subscription = Database['public']['Tables']['subscriptions']['Row'];

function aggregateByCategory(expenses: { amount: number; category: string | null }[]) {
  const map: Record<string, number> = {};
  for (const e of expenses) {
    const cat = e.category ?? 'その他';
    map[cat] = (map[cat] ?? 0) + e.amount;
  }
  return Object.entries(map).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
}

function DaysRemainingBadge({ days }: { days: number }) {
  const color = days <= 3 ? COLORS.danger : days <= 7 ? COLORS.warning : COLORS.gray400;
  const bg    = days <= 3 ? COLORS.dangerLight : days <= 7 ? COLORS.warningLight : COLORS.gray100;
  return (
    <View style={[styles.daysBadge, { backgroundColor: bg }]}>
      <Text style={[styles.daysBadgeText, { color }]}>
        {days === 0 ? '今日更新' : `あと${days}日`}
      </Text>
    </View>
  );
}

export default function ExpensesScreen() {
  const { expenses, isLoading: expLoading, addExpense, deleteExpense, monthlyTotal, refresh: refreshExpenses } = useExpenses();
  const { names: catNames, getColor: getCatColor, fetch: refetchCategories } = useCategories();

  // フォーカス復帰時に最新データへ更新（カテゴリ管理画面・他タブでの変更を反映）
  useFocusEffect(useCallback(() => {
    refetchCategories();
    refreshExpenses();
  }, [refetchCategories, refreshExpenses]));
  const { subscriptions, isLoading: subLoading, addSubscription, updateSubscription, deleteSubscription, monthlyTotal: subMonthlyTotal } = useSubscriptions();

  const [tab, setTab] = useState<TabType>('expenses');
  const [budget, setBudget] = useState<number | null>(null);
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  const [addExpModal, setAddExpModal] = useState(false);
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState<string>('食費');
  const [expMemo, setExpMemo] = useState('');

  const [addSubModal, setAddSubModal] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subDay, setSubDay] = useState('');
  const [subMemo, setSubMemo] = useState('');

  const [saving, setSaving] = useState(false);

  const loadBudget = useCallback(async () => {
    const v = await AsyncStorage.getItem(BUDGET_KEY);
    if (v) setBudget(parseInt(v, 10));
  }, []);
  useEffect(() => { loadBudget(); }, [loadBudget]);

  async function saveBudget() {
    const v = parseInt(budgetInput, 10);
    if (isNaN(v) || v <= 0) { Alert.alert('入力エラー', '正しい金額を入力してください'); return; }
    await AsyncStorage.setItem(BUDGET_KEY, String(v));
    setBudget(v);
    setBudgetModalVisible(false);
  }

  async function handleAddExpense() {
    const amount = parseInt(expAmount, 10);
    if (!expTitle.trim() || isNaN(amount) || amount <= 0) {
      Alert.alert('入力エラー', '内容と金額を正しく入力してください'); return;
    }
    setSaving(true);
    const error = await addExpense({
      title: expTitle.trim(), amount, category: expCategory,
      paid_at: localYMD(new Date()),
      note: expMemo.trim() || null,
    });
    setSaving(false);
    if (error) Alert.alert('エラー', error.message);
    else setAddExpModal(false);
  }

  function openSubModal(sub?: Subscription) {
    if (sub) {
      // 編集モード：既存データをフォームに入れる
      setEditingSub(sub);
      setSubName(sub.service_name);
      setSubAmount(String(sub.amount));
      setSubDay(String(sub.renewal_day));
      setSubMemo(sub.memo ?? '');
    } else {
      // 追加モード：フォームをクリア
      setEditingSub(null);
      setSubName(''); setSubAmount(''); setSubDay(''); setSubMemo('');
    }
    setAddSubModal(true);
  }

  async function handleSaveSubscription() {
    const amount = parseInt(subAmount, 10);
    const day = parseInt(subDay, 10);
    if (!subName.trim()) {
      Alert.alert('入力エラー', 'サービス名を入力してください'); return;
    }
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('入力エラー', '月額を正しく入力してください（例: 980）'); return;
    }
    if (isNaN(day) || day < 1 || day > 28) {
      Alert.alert('入力エラー', '更新日は1〜28の数字で入力してください（例: 15）'); return;
    }
    setSaving(true);
    const payload = {
      service_name: subName.trim(), amount, renewal_day: day,
      memo: subMemo.trim() || null,
    };
    const error = editingSub
      ? await updateSubscription(editingSub.id, payload)
      : await addSubscription({ ...payload, is_active: true });
    setSaving(false);
    if (error) {
      if (error.message?.includes('renewal_day') || error.message?.includes('column')) {
        Alert.alert(
          'データベースエラー',
          'Supabaseのsubscriptionsテーブルが古い構造です。\nSQL Editorで002_subscriptions_v2.sqlを実行してください。',
        );
      } else {
        Alert.alert('エラー', error.message);
      }
    } else {
      setAddSubModal(false);
    }
  }

  function openAddModal() {
    if (tab === 'expenses') {
      setExpTitle(''); setExpAmount(''); setExpCategory('食費'); setExpMemo('');
      setAddExpModal(true);
    } else {
      openSubModal(); // 追加モードで開く
    }
  }

  const remaining = budget !== null ? budget - monthlyTotal : null;
  const usageRate = budget ? Math.min(monthlyTotal / budget, 1) : 0;
  const overBudget = budget !== null && monthlyTotal > budget;
  const categoryData = aggregateByCategory(expenses);
  const maxAmount = categoryData[0]?.total ?? 1;

  const now = new Date();
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const isLoading = expLoading || subLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>支出管理</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tab === 'expenses' && (
            <TouchableOpacity style={styles.budgetBtn} onPress={() => { setBudgetInput(budget ? String(budget) : ''); setBudgetModalVisible(true); }}>
              <Text style={styles.budgetBtnText}>予算設定</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
            <Text style={styles.addBtnText}>＋ 追加</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabBar}>
        {(['expenses', 'subscriptions'] as TabType[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabItem, tab === t && styles.tabItemActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'expenses' ? '支出' : 'サブスク'}
            </Text>
            {t === 'subscriptions' && subMonthlyTotal > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>¥{(subMonthlyTotal / 1000).toFixed(1)}k</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      ) : tab === 'expenses' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryMonth}>{monthLabel}の支出</Text>
            <Text style={[styles.summaryAmount, overBudget && { color: COLORS.danger }]}>
              ¥{monthlyTotal.toLocaleString()}
            </Text>
            {budget !== null ? (
              <View style={styles.budgetSection}>
                <View style={styles.budgetBar}>
                  <View style={[styles.budgetFill, {
                    width: `${usageRate * 100}%`,
                    backgroundColor: overBudget ? COLORS.danger : COLORS.primary,
                  }]} />
                </View>
                <View style={styles.budgetLabels}>
                  <Text style={[styles.budgetRemaining, overBudget && { color: COLORS.danger }]}>
                    {overBudget ? `¥${(monthlyTotal - budget).toLocaleString()} オーバー` : `残り ¥${remaining!.toLocaleString()}`}
                  </Text>
                  <Text style={styles.budgetTotal}>予算 ¥{budget.toLocaleString()}</Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { setBudgetInput(''); setBudgetModalVisible(true); }}>
                <Text style={styles.setBudgetHint}>＋ 月予算を設定する</Text>
              </TouchableOpacity>
            )}
          </View>

          {categoryData.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>カテゴリ別</Text>
              {categoryData.map(({ cat, total }) => {
                const color = getCatColor(cat);
                const pct = total / maxAmount;
                const share = monthlyTotal > 0 ? Math.round((total / monthlyTotal) * 100) : 0;
                return (
                  <View key={cat} style={styles.chartRow}>
                    <Text style={styles.chartLabel}>{cat}</Text>
                    <View style={styles.chartBarBg}>
                      <View style={[styles.chartBarFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
                    </View>
                    <Text style={styles.chartAmount}>¥{total.toLocaleString()}</Text>
                    <Text style={styles.chartPct}>{share}%</Text>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={styles.listTitle}>明細</Text>
          {expenses.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>💰</Text>
              <Text style={styles.emptyText}>今月の支出はまだありません</Text>
            </View>
          ) : (
            expenses.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.expenseRow}
                onLongPress={() => Alert.alert(item.title, '削除しますか？', [
                  { text: 'キャンセル', style: 'cancel' },
                  { text: '削除', style: 'destructive', onPress: () => deleteExpense(item.id) },
                ])}
              >
                <View style={[styles.catDot, { backgroundColor: getCatColor(item.category) }]} />
                <View style={styles.expenseBody}>
                  <Text style={styles.expenseTitle}>{item.title}</Text>
                  {item.note ? <Text style={styles.expenseMemo}>{item.note}</Text> : null}
                  <Text style={styles.expenseDate}>{item.category ?? 'その他'} · {item.paid_at}</Text>
                </View>
                <Text style={styles.expenseAmount}>¥{item.amount.toLocaleString()}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={styles.subSummaryCard}>
            <View>
              <Text style={styles.summaryMonth}>月額合計</Text>
              <Text style={styles.subSummaryAmount}>¥{subMonthlyTotal.toLocaleString()}</Text>
              <Text style={styles.subSummaryYear}>年間 ¥{(subMonthlyTotal * 12).toLocaleString()}</Text>
            </View>
            <View style={styles.subCountBox}>
              <Text style={styles.subCountNum}>{subscriptions.length}</Text>
              <Text style={styles.subCountLabel}>件</Text>
            </View>
          </View>

          {subscriptions.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>🔄</Text>
              <Text style={styles.emptyText}>サブスクが登録されていません</Text>
            </View>
          ) : (
            subscriptions.map(sub => (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                onEdit={() => openSubModal(sub)}
                onDelete={() => Alert.alert(sub.service_name, '削除しますか？', [
                  { text: 'キャンセル', style: 'cancel' },
                  { text: '削除', style: 'destructive', onPress: () => deleteSubscription(sub.id) },
                ])}
              />
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={budgetModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setBudgetModalVisible(false)}>
              <Text style={styles.cancelText}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>月予算を設定</Text>
            <TouchableOpacity onPress={saveBudget}>
              <Text style={styles.saveText}>保存</Text>
            </TouchableOpacity>
          </View>
          <View style={{ padding: 24 }}>
            <Text style={styles.inputLabel}>月の予算（円）</Text>
            <TextInput
              style={[styles.input, { fontSize: 28, fontWeight: '800', textAlign: 'center' }]}
              placeholder="例: 30000"
              value={budgetInput}
              onChangeText={setBudgetInput}
              keyboardType="number-pad"
              autoFocus
            />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={addExpModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setAddExpModal(false)}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>支出を追加</Text>
              <TouchableOpacity onPress={handleAddExpense} disabled={saving}>
                <Text style={[styles.saveText, saving && { opacity: 0.4 }]}>{saving ? '保存中...' : '追加'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>内容 *</Text>
              <TextInput style={styles.input} placeholder="例: ランチ" value={expTitle} onChangeText={setExpTitle} autoFocus />
              <Text style={styles.inputLabel}>金額（円）*</Text>
              <TextInput style={styles.input} placeholder="例: 850" value={expAmount} onChangeText={setExpAmount} keyboardType="number-pad" />
              <Text style={styles.inputLabel}>カテゴリ</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {catNames.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catChip, { borderColor: getCatColor(c) }, expCategory === c && { backgroundColor: getCatColor(c) }]}
                    onPress={() => setExpCategory(c)}
                  >
                    <Text style={[styles.catChipText, expCategory === c && { color: '#fff' }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.inputLabel}>メモ（任意）</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="例: 友達とランチ"
                value={expMemo}
                onChangeText={setExpMemo}
                multiline
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={addSubModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setAddSubModal(false)}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingSub ? 'サブスクを編集' : 'サブスクを追加'}</Text>
              <TouchableOpacity onPress={handleSaveSubscription} disabled={saving}>
                <Text style={[styles.saveText, saving && { opacity: 0.4 }]}>{saving ? '保存中...' : editingSub ? '更新' : '追加'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>サービス名 *</Text>
              <TextInput style={styles.input} placeholder="例: Netflix" value={subName} onChangeText={setSubName} autoFocus />
              <Text style={styles.inputLabel}>月額（円）*</Text>
              <TextInput style={styles.input} placeholder="例: 1490" value={subAmount} onChangeText={setSubAmount} keyboardType="number-pad" />
              <Text style={styles.inputLabel}>更新日（1〜28）*</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 15"
                value={subDay}
                onChangeText={setSubDay}
                keyboardType="number-pad"
              />
              <Text style={styles.inputLabel}>メモ（任意）</Text>
              <TextInput
                style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
                placeholder="例: スタンダードプラン"
                value={subMemo}
                onChangeText={setSubMemo}
                multiline
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function SubscriptionCard({ sub, onEdit, onDelete }: { sub: Subscription; onEdit: () => void; onDelete: () => void }) {
  const days = daysUntilRenewal(sub.renewal_day);
  const nextDate = getNextRenewalDate(sub.renewal_day);
  const nextStr = `${nextDate.getMonth() + 1}/${nextDate.getDate()}`;

  return (
    <TouchableOpacity style={styles.subCard} onPress={onEdit} activeOpacity={0.8}>
      <View style={styles.subCardLeft}>
        <Text style={styles.subServiceName}>{sub.service_name}</Text>
        {sub.memo ? <Text style={styles.subMemo}>{sub.memo}</Text> : null}
        <Text style={styles.subRenewalDate}>更新日: 毎月{sub.renewal_day}日（次回 {nextStr}）</Text>
      </View>
      <View style={styles.subCardRight}>
        <Text style={styles.subAmount}>¥{sub.amount.toLocaleString()}<Text style={styles.subAmountUnit}>/月</Text></Text>
        <DaysRemainingBadge days={days} />
        <TouchableOpacity style={styles.subDeleteBtn} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.subDeleteBtnText}>削除</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.gray900 },
  budgetBtn: { borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  budgetBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: COLORS.gray100, borderRadius: 12, padding: 3 },
  tabItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tabItemActive: { backgroundColor: COLORS.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: COLORS.gray400 },
  tabTextActive: { color: COLORS.gray900 },
  tabBadge: { backgroundColor: COLORS.warning + '30', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.warning },
  summaryCard: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: COLORS.white,
    borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  summaryMonth: { fontSize: 13, color: COLORS.gray400, marginBottom: 4 },
  summaryAmount: { fontSize: 36, fontWeight: '800', color: COLORS.gray900 },
  budgetSection: { marginTop: 14 },
  budgetBar: { height: 8, backgroundColor: COLORS.gray100, borderRadius: 4, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 4 },
  budgetLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  budgetRemaining: { fontSize: 13, fontWeight: '700', color: COLORS.gray600 },
  budgetTotal: { fontSize: 13, color: COLORS.gray400 },
  setBudgetHint: { marginTop: 10, color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  subSummaryCard: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: COLORS.primary,
    borderRadius: 16, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 12, elevation: 4,
  },
  subSummaryAmount: { fontSize: 32, fontWeight: '800', color: '#fff' },
  subSummaryYear: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  subCountBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: 14 },
  subCountNum: { fontSize: 28, fontWeight: '800', color: '#fff' },
  subCountLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  chartCard: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: COLORS.white,
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  chartTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray900, marginBottom: 12 },
  chartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  chartLabel: { fontSize: 12, color: COLORS.gray600, width: 52 },
  chartBarBg: { flex: 1, height: 10, backgroundColor: COLORS.gray100, borderRadius: 5, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: 5 },
  chartAmount: { fontSize: 12, fontWeight: '600', color: COLORS.gray900, width: 72, textAlign: 'right' },
  chartPct: { fontSize: 11, color: COLORS.gray400, width: 30, textAlign: 'right' },
  listTitle: { fontSize: 14, fontWeight: '700', color: COLORS.gray600, paddingHorizontal: 16, marginBottom: 8 },
  expenseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.white, marginHorizontal: 16, marginBottom: 6,
    borderRadius: 12, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  expenseBody: { flex: 1 },
  expenseTitle: { fontSize: 15, fontWeight: '600', color: COLORS.gray900 },
  expenseMemo: { fontSize: 12, color: COLORS.gray400, marginTop: 1 },
  expenseDate: { fontSize: 11, color: COLORS.gray400, marginTop: 2 },
  expenseAmount: { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  subCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.white, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  subCardLeft: { flex: 1, paddingRight: 12 },
  subServiceName: { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  subMemo: { fontSize: 12, color: COLORS.gray400, marginTop: 2 },
  subRenewalDate: { fontSize: 11, color: COLORS.gray400, marginTop: 4 },
  subCardRight: { alignItems: 'flex-end', gap: 6 },
  subAmount: { fontSize: 18, fontWeight: '800', color: COLORS.gray900 },
  subAmountUnit: { fontSize: 12, fontWeight: '400', color: COLORS.gray400 },
  subDeleteBtn: { marginTop: 2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: COLORS.dangerLight },
  subDeleteBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.danger },
  daysBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  daysBadgeText: { fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 15, color: COLORS.gray400 },
  modalContainer: { flex: 1, backgroundColor: COLORS.white },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  cancelText: { fontSize: 16, color: COLORS.gray600 },
  saveText: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.gray600, marginBottom: 6, marginTop: 16 },
  inputHint: { fontSize: 12, color: COLORS.gray400, marginTop: 4 },
  input: { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: COLORS.gray50 },
  catChip: { borderWidth: 2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  catChipText: { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
});
