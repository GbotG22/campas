import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { localYMD } from '@/lib/dateUtils';
import type { Database } from '@/types/database';

type Expense = Database['public']['Tables']['expenses']['Row'];
type InsertExpense = Database['public']['Tables']['expenses']['Insert'];

export function useExpenses(year?: number, month?: number) {
  const { user } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const now = new Date();
    const y = year  ?? now.getFullYear();
    const m = month ?? (now.getMonth() + 1);
    const firstDay = localYMD(new Date(y, m - 1, 1));
    const lastDay  = localYMD(new Date(y, m,     0));

    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .gte('paid_at', firstDay)
      .lte('paid_at', lastDay)
      .order('paid_at', { ascending: false });

    setExpenses(data ?? []);
    setIsLoading(false);
  }, [user, year, month]);

  useEffect(() => { fetch(); }, [fetch]);

  const addExpense = async (item: Omit<InsertExpense, 'user_id'>) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...item, user_id: user.id })
      .select()
      .single();
    if (!error && data) setExpenses(prev => [data, ...prev]);
    return error;
  };

  const updateExpense = async (id: string, item: Partial<Omit<InsertExpense, 'user_id'>>) => {
    const { data, error } = await supabase
      .from('expenses')
      .update(item)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) setExpenses(prev => prev.map(e => e.id === id ? data : e));
    return error;
  };

  const deleteExpense = async (id: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (!error) setExpenses(prev => prev.filter(e => e.id !== id));
    return error;
  };

  const monthlyTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  return { expenses, isLoading, addExpense, updateExpense, deleteExpense, monthlyTotal, refresh: fetch };
}
