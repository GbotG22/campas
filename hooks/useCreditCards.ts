import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database';

export type CreditCard = Database['public']['Tables']['credit_cards']['Row'];
export type CreditCardInsert = Database['public']['Tables']['credit_cards']['Insert'];
export type CreditCardUpdate = Database['public']['Tables']['credit_cards']['Update'];

/** 締め日を起点に今期の開始日・終了日（締め日当日）を返す */
export function getClosingPeriod(card: CreditCard, today: Date = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-based
  const d = today.getDate();

  // 今月締め日
  const closingThisMonth = new Date(y, m, card.closing_day);
  let periodEnd: Date;
  let periodStart: Date;

  if (d <= card.closing_day) {
    // 今月の締め日がまだ来ていない → 今期
    periodEnd = closingThisMonth;
    periodStart = new Date(y, m - 1, card.closing_day + 1);
  } else {
    // 今月の締め日を過ぎた → 次期
    periodEnd = new Date(y, m + 1, card.closing_day);
    periodStart = new Date(y, m, card.closing_day + 1);
  }

  return { periodStart, periodEnd };
}

/** 引き落とし日を返す */
export function getPaymentDate(card: CreditCard, today: Date = new Date()): Date {
  const { periodEnd } = getClosingPeriod(card, today);
  const base = periodEnd;
  const payMonth = base.getMonth() + card.payment_month_offset;
  return new Date(base.getFullYear(), payMonth, card.payment_day);
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
