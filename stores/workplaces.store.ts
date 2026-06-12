import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  rescheduleAllPaydayNotifications,
  schedulePaydayNotification,
  cancelPaydayNotification,
  cancelShiftNotification,
} from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

export type Workplace     = Database['public']['Tables']['workplaces']['Row'];
type InsertWorkplace      = Database['public']['Tables']['workplaces']['Insert'];

export const WORKPLACE_COLORS = [
  '#10B981', '#4F46E5', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
] as const;

const cacheKey = (uid: string) => `campas_workplaces_${uid}`;

interface WorkplacesState {
  workplaces: Workplace[];
  isLoading:  boolean;

  fetch:           () => Promise<void>;
  addWorkplace:    (item: Omit<InsertWorkplace, 'user_id'>) => Promise<any>;
  updateWorkplace: (id: string, updates: Partial<InsertWorkplace>) => Promise<any>;
  deleteWorkplace: (id: string) => Promise<any>;
}

export const useWorkplacesStore = create<WorkplacesState>((set, get) => ({
  workplaces: [],
  isLoading:  false,

  fetch: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    set({ isLoading: true });

    try {
      const cached = await AsyncStorage.getItem(cacheKey(user.id));
      if (cached) set({ workplaces: JSON.parse(cached), isLoading: false });
    } catch {}

    try {
      const { data, error } = await supabase
        .from('workplaces')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at');
      if (error) {
        console.error('[WorkplacesStore] fetch error:', error.code, error.message, error.details);
      } else if (data) {
        set({ workplaces: data });
        AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(data)).catch(() => {});
        rescheduleAllPaydayNotifications(data).catch(() => {});
      }
    } catch (e) {
      console.error('[WorkplacesStore] fetch exception:', e);
    }
    set({ isLoading: false });
  },

  addWorkplace: async (item) => {
    const user = useAuthStore.getState().user;
    if (!user) {
      console.error('[WorkplacesStore] addWorkplace: ユーザー未認証');
      return { message: 'ログインが必要です' };
    }
    console.log('[WorkplacesStore] addWorkplace payload:', JSON.stringify({ ...item, user_id: user.id }));
    const { data, error } = await supabase
      .from('workplaces')
      .insert({ ...item, user_id: user.id })
      .select()
      .single();
    if (error) {
      console.error('[WorkplacesStore] add error:', error.code, error.message, error.details, error.hint);
    } else if (data) {
      const next = [...get().workplaces, data];
      set({ workplaces: next });
      AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next)).catch(() => {});
      if (data.is_active) schedulePaydayNotification(data).catch(() => {});
    }
    return error;
  },

  updateWorkplace: async (id, updates) => {
    const user = useAuthStore.getState().user;
    if (!user) return { message: 'ログインが必要です' };

    const { data, error } = await supabase
      .from('workplaces').update(updates).eq('id', id).select().single();
    if (error) {
      console.error('[WorkplacesStore] update error:', error.code, error.message);
    } else if (data) {
      const next = get().workplaces.map(w => w.id === id ? data : w);
      set({ workplaces: next });
      AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next)).catch(() => {});
      cancelPaydayNotification(id).catch(() => {});
      if (data.is_active) schedulePaydayNotification(data).catch(() => {});
    }
    return error;
  },

  deleteWorkplace: async (id) => {
    const user = useAuthStore.getState().user;
    if (!user) return { message: 'ログインが必要です' };

    // 削除前に紐づくシフトIDを控える（DB側は cascade で消えるが、
    // 端末にスケジュール済みの開始前通知はキャンセルしないと残るため）
    let shiftIds: string[] = [];
    try {
      const { data } = await supabase
        .from('shifts').select('id').eq('workplace_id', id);
      shiftIds = (data ?? []).map(s => s.id);
    } catch { /* 取得失敗時は次回の rescheduleAll で同期される */ }

    const { error } = await supabase.from('workplaces').delete().eq('id', id);
    if (error) {
      console.error('[WorkplacesStore] delete error:', error.code, error.message);
    } else {
      const next = get().workplaces.filter(w => w.id !== id);
      set({ workplaces: next });
      AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next)).catch(() => {});
      cancelPaydayNotification(id).catch(() => {});
      shiftIds.forEach(sid => cancelShiftNotification(sid).catch(() => {}));
    }
    return error;
  },
}));
