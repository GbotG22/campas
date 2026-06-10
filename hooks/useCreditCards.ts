import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database';

export type CreditCard = Database['public']['Tables']['credit_cards']['Row'];
export type CreditCardInsert = Database['public']['Tables']['credit_cards']['Insert'];
export type CreditCardUpdate = Database['public']['Tables']['credit_cards']['Update'];

/** closing_day=31 など月をまたぐ overflow を防ぐ: 月の末日にクランプ */
function clampDay(year: number, month0: number, day: number): Date {
  // new Date(y, m+1, 0) → month の最終日
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  return new Date(year, month0, Math.min(day, lastDay));
}

/** 締め日を起点に今期の開始日・終了日（締め日当日）を返す */
export function getClosingPeriod(card: CreditCard, today: Date = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-based
  const d = today.getDate();

  const closingThisMonth = clampDay(y, m, card.closing_day);
  const actualClosingDay = closingThisMonth.getDate();

  let periodEnd: Date;
  let periodStart: Date;

  if (d <= actualClosingDay) {
    // 今月の締め日がまだ来ていない → 今期
    periodEnd   = closingThisMonth;
    const prevClosing = clampDay(y, m - 1, card.closing_day);
    periodStart = new Date(prevClosing.getFullYear(), prevClosing.getMonth(), prevClosing.getDate() + 1);
  } else {
    // 今月の締め日を過ぎた → 次期
    periodEnd   = clampDay(y, m + 1, card.closing_day);
    periodStart = new Date(y, m, actualClosingDay + 1);
  }

  return { periodStart, periodEnd };
}

/** 引き落とし日を返す */
export function getPaymentDate(card: CreditCard, today: Date = new Date()): Date {
  const { periodEnd } = getClosingPeriod(card, today);
  const payMonth = periodEnd.getMonth() + card.payment_month_offset;
  return clampDay(periodEnd.getFullYear(), payMonth, card.payment_day);
}

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('credit_cards')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (err) {
      setError(err.message);
    } else {
      setCards(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const addCard = useCallback(async (card: Omit<CreditCardInsert, 'user_id'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error: err } = await supabase
      .from('credit_cards')
      .insert({ ...card, user_id: user.id })
      .select()
      .single();
    if (err) throw err;
    setCards(prev => [...prev, data]);
    return data;
  }, []);

  const updateCard = useCallback(async (id: string, updates: CreditCardUpdate) => {
    const { data, error: err } = await supabase
      .from('credit_cards')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (err) throw err;
    setCards(prev => prev.map(c => c.id === id ? data : c));
    return data;
  }, []);

  const deleteCard = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('credit_cards')
      .update({ is_active: false })
      .eq('id', id);
    if (err) throw err;
    setCards(prev => prev.filter(c => c.id !== id));
  }, []);

  return { cards, loading, error, refetch: fetchCards, addCard, updateCard, deleteCard };
}
