import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import {
  scheduleSubscriptionNotification,
  cancelSubscriptionNotifications,
  rescheduleSubscriptionNotifications,
} from '@/lib/notifications';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

type Subscription    = Database['public']['Tables']['subscriptions']['Row'];
type InsertSubscription = Database['public']['Tables']['subscriptions']['Insert'];

interface SubscriptionsState {
  subscriptions: Subscription[];
  isLoading:     boolean;
  monthlyTotal:  number;
  fetch:              () => Promise<void>;
  addSubscription:    (item: Omit<InsertSubscription, 'user_id'>) => Promise<{ message: string } | null>;
  updateSubscription: (id: string, updates: Partial<Omit<InsertSubscription, 'user_id'>>) => Promise<{ message: string } | null>;
  deleteSubscription: (id: string) => Promise<{ message: string } | null>;
}

export const useSubscriptionsStore = create<SubscriptionsState>((set, get) => ({
  subscriptions: [],
  isLoading:     false,
  monthlyTotal:  0,

  // ── fetch ─────────────────────────────────────────────────────
  fetch: async () => {
    // Zustand ストア外から auth ストアを参照
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoading: true });

    const { data: subs } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('amount', { ascending: false });

    const list = subs ?? [];
    set({
      subscriptions: list,
      monthlyTotal:  list.reduce((sum, s) => sum + s.amount, 0),
      isLoading:     false,
    });

    // 通知スケジュール（Expo Goでも動作する・getNotifications() が null の場合は no-op）
    {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const { data: recentExpenses } = await supabase
        .from('expenses')
        .select('title')
        .eq('user_id', user.id)
        .gte('paid_at', threeMonthsAgo.toISOString().split('T')[0]);
      const recentTitles = (recentExpenses ?? []).map(e => e.title);
      rescheduleSubscriptionNotifications(list, recentTitles).catch(() => {});
    }
  },

  // ── addSubscription ───────────────────────────────────────────
  addSubscription: async (item) => {
    const user = useAuthStore.getState().user;
    if (!user) return null;

    const { data, error } = await supabase
      .from('subscriptions')
      .insert({ ...item, user_id: user.id })
      .select()
      .single();

    if (error) {
      // Expo デバコンソールで確認できるよう詳細を出力
      console.error('[addSubscription] DB error:', error.code, error.message, error.details);
    }
    if (!error && data) {
      const next = [...get().subscriptions, data].sort((a, b) => b.amount - a.amount);
      set({
        subscriptions: next,
        monthlyTotal:  next.reduce((sum, s) => sum + s.amount, 0),
      });
      // 新規サブスク更新3日前の通知を登録
      scheduleSubscriptionNotification(data).catch(() => {});
    }
    return error;
  },

  // ── updateSubscription ───────────────────────────────────────
  updateSubscription: async (id, updates) => {
    const { data, error } = await supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[updateSubscription] DB error:', error.code, error.message, error.details);
    }
    if (!error && data) {
      const next = get().subscriptions
        .map(s => s.id === id ? { ...s, ...data } : s)
        .sort((a, b) => b.amount - a.amount);
      set({
        subscriptions: next,
        monthlyTotal:  next.reduce((sum, s) => sum + s.amount, 0),
      });
      // 更新日・金額が変わった可能性があるため再スケジュール
      cancelSubscriptionNotifications(id).catch(() => {});
      scheduleSubscriptionNotification(data).catch(() => {});
    }
    return error;
  },

  // ── deleteSubscription ────────────────────────────────────────
  deleteSubscription: async (id) => {
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (!error) {
      const next = get().subscriptions.filter(s => s.id !== id);
      set({
        subscriptions: next,
        monthlyTotal:  next.reduce((sum, s) => sum + s.amount, 0),
      });
      cancelSubscriptionNotifications(id).catch(() => {});
    }
    return error;
  },
}));
