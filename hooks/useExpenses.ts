import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

type Expense = Database['public']['Tables']['expenses']['Row'];
type InsertExpense = Database['public']['Tables']['expenses']['Insert'];

export function useExpenses() {
  const { user } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .gte('paid_at', firstDay)
      .lte('paid_at', lastDay)
      .order('paid_at', { ascending: false });

    setExpenses(data ?? []);
    setIsLoading(false);
  }, [user]);

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

  const deleteExpense = async (id: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (!error) setExpenses(prev => prev.filter(e => e.id !== id));
    return error;
  };

  const monthlyTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  return { expenses, isLoading, addExpense, deleteExpense, monthlyTotal, refresh: fetch };
}
