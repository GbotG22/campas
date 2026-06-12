import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import {
  scheduleEventNotifications,
  scheduleCustomEventNotification,
  cancelEventNotifications,
  rescheduleAllEventNotifications,
} from '@/lib/notifications';
import { useAuthStore } from '@/stores/auth.store';
import type { Database, EventType } from '@/types/database';

// 通知対象のイベントタイプ（締切がある・完了できるもの）
const NOTIFIABLE_TYPES: EventType[] = ['assignment', 'test', 'report'];

export type AppEvent = Database['public']['Tables']['events']['Row'];
type InsertEvent     = Database['public']['Tables']['events']['Insert'];

const cacheKey = (uid: string) => `campas_events_${uid}`;

interface EventsState {
  events:    AppEvent[];
  isLoading: boolean;

  fetch:       () => Promise<void>;
  addEvent:    (item: Omit<InsertEvent, 'user_id'>) => Promise<any>;
  updateEvent: (id: string, updates: Partial<InsertEvent>) => Promise<any>;
  deleteEvent: (id: string) => Promise<any>;
  toggleDone:  (id: string) => Promise<void>;
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events:    [],
  isLoading: false,

  // ── フェッチ ─────────────────────────────────────────────
  fetch: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    set({ isLoading: true });

    // キャッシュ
    try {
      const cached = await AsyncStorage.getItem(cacheKey(user.id));
      if (cached) set({ events: JSON.parse(cached), isLoading: false });
    } catch {}

    // Supabase（直近90日〜180日先）
    try {
      const from = new Date(); from.setDate(from.getDate() - 90);
      const to   = new Date(); to.setDate(to.getDate()  + 180);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_date', from.toISOString().split('T')[0])
        .lte('start_date', to.toISOString().split('T')[0])
        .order('start_date')
        .order('start_time');
      if (error) {
        console.error('[EventsStore] fetch error:', error.code, error.message, error.hint);
      } else if (data) {
        set({ events: data });
        AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(data)).catch(() => {});
        // アプリ起動・再フェッチ時に通知を最新状態へ同期
        rescheduleAllEventNotifications(data).catch(() => {});
      }
    } catch (e) {
      console.error('[EventsStore] fetch exception:', e);
    }
    set({ isLoading: false });
  },

  // ── 追加 ─────────────────────────────────────────────────
  addEvent: async (item) => {
    const user = useAuthStore.getState().user;
    if (!user) return { message: 'ログインが必要です' };

    const { data, error } = await supabase
      .from('events')
      .insert({ ...item, user_id: user.id, external_source: 'manual' })
      .select()
      .single();

    if (error) {
      console.error('[EventsStore] add error:', error.code, error.message, error.hint);
    } else if (data) {
      const next = [...get().events, data].sort((a, b) =>
        a.start_date.localeCompare(b.start_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''),
      );
      set({ events: next });
      AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next)).catch(() => {});
      // 課題・テスト・レポートは締切通知を自動登録
      if (NOTIFIABLE_TYPES.includes(data.event_type as EventType)) {
        scheduleEventNotifications(data).catch(() => {});
      }
      // 予定個別の通知設定があれば登録
      scheduleCustomEventNotification(data).catch(() => {});
    }
    return error;
  },

  // ── 更新 ─────────────────────────────────────────────────
  updateEvent: async (id, updates) => {
    const user = useAuthStore.getState().user;
    if (!user) return { message: 'ログインが必要です' };

    const { data, error } = await supabase
      .from('events').update(updates).eq('id', id).select().single();
    if (error) {
      console.error('[EventsStore] update error:', error.code, error.message);
    } else if (data) {
      const next = get().events.map(e => e.id === id ? data : e)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      set({ events: next });
      AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next)).catch(() => {});
      // 古い通知を一旦キャンセル（日付・タイトル変更に対応）
      cancelEventNotifications(id).catch(() => {});
      // 未完了 & 通知対象タイプなら新しい内容で再スケジュール
      if (NOTIFIABLE_TYPES.includes(data.event_type as EventType) && !data.is_done) {
        scheduleEventNotifications(data).catch(() => {});
      }
      // 予定個別の通知も新しい内容で再登録
      scheduleCustomEventNotification(data).catch(() => {});
    }
    return error;
  },

  // ── 削除 ─────────────────────────────────────────────────
  deleteEvent: async (id) => {
    const user = useAuthStore.getState().user;
    if (!user) return { message: 'ログインが必要です' };

    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) {
      console.error('[EventsStore] delete error:', error.code, error.message);
    } else {
      const next = get().events.filter(e => e.id !== id);
      set({ events: next });
      AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next)).catch(() => {});
      // 削除された予定の通知をキャンセル
      cancelEventNotifications(id).catch(() => {});
    }
    return error;
  },

  // ── 完了トグル ────────────────────────────────────────────
  toggleDone: async (id) => {
    const ev = get().events.find(e => e.id === id);
    if (!ev) return;
    await get().updateEvent(id, { is_done: !ev.is_done });
  },
}));
