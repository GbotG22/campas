import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import type { Database, IncomeType } from '@/types/database';

export type Income       = Database['public']['Tables']['incomes']['Row'];
type InsertIncome        = Database['public']['Tables']['incomes']['Insert'];
export type SalaryRecord = Database['public']['Tables']['salary_records']['Row'];
type InsertSalaryRecord  = Database['public']['Tables']['salary_records']['Insert'];

export const INCOME_TYPE_CONFIG: Record<IncomeType, { label: string; color: string; icon: string }> = {
  salary:    { label: '給与',         color: '#10B981', icon: 'cash-outline' },
  allowance: { label: '仕送り',       color: '#6366F1', icon: 'home-outline' },
  bonus:     { label: 'ボーナス',     color: '#F59E0B', icon: 'gift-outline' },
  part_time: { label: 'アルバイト',   color: '#06B6D4', icon: 'briefcase-outline' },
  other:     { label: 'その他収入',   color: '#9CA3AF', icon: 'ellipsis-horizontal-circle-outline' },
};

const incomeCacheKey = (uid: string) => `campas_incomes_${uid}`;
const salaryCacheKey = (uid: string) => `campas_salary_records_${uid}`;

export function useIncomes() {
  const { user } = useAuthStore();
  const [incomes,        setIncomes]        = useState<Income[]>([]);
  const [salaryRecords,  setSalaryRecords]  = useState<SalaryRecord[]>([]);
  const [isLoading,      setIsLoading]      = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    // ── キャッシュ ──
    try {
      const ic = await AsyncStorage.getItem(incomeCacheKey(user.id));
      if (ic) setIncomes(JSON.parse(ic));
      const sc = await AsyncStorage.getItem(salaryCacheKey(user.id));
      if (sc) setSalaryRecords(JSON.parse(sc));
      if (ic) setIsLoading(false);
    } catch { /* ignore */ }

    // ── Supabase ──
    try {
      const [incRes, salRes] = await Promise.all([
        supabase.from('incomes').select('*').eq('user_id', user.id)
          .order('received_at', { ascending: false }),
        supabase.from('salary_records').select('*, workplace:workplaces(name,color)')
          .eq('user_id', user.id).order('year_month', { ascending: false }),
      ]);
      if (!incRes.error && incRes.data) {
        setIncomes(incRes.data);
        AsyncStorage.setItem(incomeCacheKey(user.id), JSON.stringify(incRes.data)).catch(() => {});
      }
      if (!salRes.error && salRes.data) {
        setSalaryRecords(salRes.data as SalaryRecord[]);
        AsyncStorage.setItem(salaryCacheKey(user.id), JSON.stringify(salRes.data)).catch(() => {});
      }
    } catch { /* ignore */ }

    setIsLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── 収入 CRUD ──────────────────────────────────────────────
  const addIncome = async (item: Omit<InsertIncome, 'user_id'>) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('incomes').insert({ ...item, user_id: user.id }).select().single();
    if (!error && data) {
      const next = [data, ...incomes].sort((a, b) => b.received_at.localeCompare(a.received_at));
      setIncomes(next);
      AsyncStorage.setItem(incomeCacheKey(user.id), JSON.stringify(next)).catch(() => {});
    }
    return error;
  };

  const deleteIncome = async (id: string) => {
    const { error } = await supabase.from('incomes').delete().eq('id', id);
    if (!error) {
      const next = incomes.filter(i => i.id !== id);
      setIncomes(next);
      AsyncStorage.setItem(incomeCacheKey(user!.id), JSON.stringify(next)).catch(() => {});
    }
    return error;
  };

  // ── 給与記録 CRUD ──────────────────────────────────────────
  const addSalaryRecord = async (item: Omit<InsertSalaryRecord, 'user_id'>) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('salary_records').insert({ ...item, user_id: user.id }).select().single();
    if (!error && data) {
      const next = [data, ...salaryRecords].sort((a, b) => b.year_month.localeCompare(a.year_month));
      setSalaryRecords(next as SalaryRecord[]);
      AsyncStorage.setItem(salaryCacheKey(user.id), JSON.stringify(next)).catch(() => {});
    }
    return error;
  };

  const deleteSalaryRecord = async (id: string) => {
    const { error } = await supabase.from('salary_records').delete().eq('id', id);
    if (!error) {
      const next = salaryRecords.filter(r => r.id !== id);
      setSalaryRecords(next);
      AsyncStorage.setItem(salaryCacheKey(user!.id), JSON.stringify(next)).catch(() => {});
    }
    return error;
  };

  /** 月ごとの収入合計 */
  const getMonthlyTotal = (yearMonth: string) =>
    incomes
      .filter(i => i.received_at.startsWith(yearMonth))
      .reduce((sum, i) => sum + i.amount, 0);

  return {
    incomes, salaryRecords, isLoading,
    addIncome, deleteIncome,
    addSalaryRecord, deleteSalaryRecord,
    getMonthlyTotal,
    refresh: load,
  };
}
