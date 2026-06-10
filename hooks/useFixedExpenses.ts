import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database';

export type FixedExpense = Database['public']['Tables']['fixed_expenses']['Row'];
export type FixedExpenseInsert = Database['public']['Tables']['fixed_expenses']['Insert'];
export type FixedExpenseCategory = FixedExpense['category'];

export const FIXED_EXPENSE_CATEGORIES: { key: FixedExpenseCategory; label: string; icon: string; color: string }[] = [
  { key: 'rent',        label: '家賃',  icon: 'home-outline',           color: '#4F8EF7' },
  { key: 'electricity', label: '電気',  icon: 'flash-outline',          color: '#F59E0B' },
  { key: 'gas',         label: 'ガス',  icon: 'flame-outline',          color: '#EF4444' },
  { key: 'water',       label: '水道',  icon: 'water-outline',          color: '#06B6D4' },
  { key: 'telecom',     label: '通信費', icon: 'wifi-outline',           color: '#8B5CF6' },
  { key: 'insurance',   label: '保険',  icon: 'shield-checkmark-outline', color: '#10B981' },
  { key: 'other',       label: 'その他', icon: 'ellipsis-horizontal-circle-outline', color: '#9CA3AF' },
];

export function getCategoryDef(key: FixedExpenseCategory) {
  return FIXED_EXPENSE_CATEGORIES.find(c => c.key === key) ?? FIXED_EXPENSE_CATEGORIES[6];
}

/** 次回支払日（今月の payment_day が過ぎていれば翌月） */
export function getNextPaymentDate(paymentDay: number, today: Date = new Date()): Date {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const lastDayThisMonth = new Date(y, m + 1, 0).getDate();
  const actualDay = Math.min(paymentDay, lastDayThisMonth);

  if (d <= actualDay) {
    return new Date(y, m, actualDay);
  }
  const nextM = m + 1;
  const lastDayNext = new Date(y, nextM + 1, 0).getDate();
  return new Date(y, nextM, Math.min(paymentDay, lastDayNext));
}

export function useFixedExpenses() {
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('fixed_expenses')
      .select('*')
      .eq('is_active', true)
      .order('payment_day', { ascending: true });
    setFixedExpenses(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const addFixedExpense = useCallback(async (item: Omit<FixedExpenseInsert, 'user_id'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('fixed_expenses')
      .insert({ ...item, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    setFixedExpenses(prev => [...prev, data].sort((a, b) => a.payment_day - b.payment_day));
    return data;
  }, []);

  const updateFixedExpense = useCallback(async (id: string, item: Partial<FixedExpenseInsert>) => {
    const { data, error } = await supabase
      .from('fixed_expenses')
      .update(item)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setFixedExpenses(prev => prev.map(e => e.id === id ? data : e).sort((a, b) => a.payment_day - b.payment_day));
    return data;
  }, []);

  const deleteFixedExpense = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('fixed_expenses')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
    setFixedExpenses(prev => prev.filter(e => e.id !== id));
  }, []);

  const monthlyTotal = fixedExpenses.reduce((s, e) => s + e.amount, 0);
  const annualTotal  = monthlyTotal * 12;

  return {
    fixedExpenses, loading,
    monthlyTotal, annualTotal,
    refetch: fetch,
    addFixedExpense, updateFixedExpense, deleteFixedExpense,
  };
}
