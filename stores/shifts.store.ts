import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import {
  scheduleShiftNotification,
  cancelShiftNotification,
  rescheduleAllShiftNotifications,
} from '@/lib/notifications';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

type Shift         = Database['public']['Tables']['shifts']['Row'];
type InsertShift   = Database['public']['Tables']['shifts']['Insert'];
type Workplace     = Database['public']['Tables']['workplaces']['Row'];

export interface ShiftWithWorkplace extends Shift {
  workplace: Workplace | null;
}

const cacheKey = (uid: string) => `campas_shifts_${uid}`;

// ── 給与計算ユーティリティ（ストア内でも使えるように export）──
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export function calcWage(hourlyWage: number, startTime: string, endTime: string, breakMinutes: number): number {
  const workMin = timeToMinutes(endTime) - timeToMinutes(startTime) - breakMinutes;
  return Math.floor(hourlyWage * Math.max(0, workMin) / 60);
}
export function calcWorkMinutes(startTime: string, endTime: string, breakMinutes: number): number {
  return Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime) - breakMinutes);
}
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

interface ShiftsState {
  shifts:    ShiftWithWorkplace[];
  isLoading: boolean;

  fetch:       () => Promise<void>;
  addShift:    (item: Omit<InsertShift, 'user_id'>, hourlyWage: number) => Promise<any>;
  updateShift: (id: string, updates: Partial<InsertShift>, hourlyWage?: number) => Promise<any>;
  deleteShift: (id: string) => Promise<any>;

  getForMonth:      (year: number, month: number) => ShiftWithWorkplace[];
  getMonthlyEstimate:(year: number, month: number) => number;
  getForDate:       (date: string) => ShiftWithWorkplace[];
  getNextShift:     () => ShiftWithWorkplace | null;
}

export const useShiftsStore = create<ShiftsState>((set, get) => ({
  shifts:    [],
  isLoading: false,

  fetch: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    set({ isLoading: true });

    try {
      const cached = await AsyncStorage.getItem(cacheKey(user.id));
      if (cached) set({ shifts: JSON.parse(cached), isLoading: false });
    } catch {}

    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*, workplace:workplaces(*)')
        .eq('user_id', user.id)
        .order('date')
        .order('start_time');
      if (error) {
        console.error('[ShiftsStore] fetch error:', error.code, error.message);
      } else if (data) {
        const typed = data as unknown as ShiftWithWorkplace[];
        set({ shifts: typed });
        AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(typed)).catch(() => {});
        // アプリ起動・再フェッチ時に通知を最新状態へ同期
        rescheduleAllShiftNotifications(
          typed.map(s => ({
            id:             s.id,
            date:           s.date,
            start_time:     s.start_time,
            workplace_name: s.workplace?.name ?? null,
          })),
        ).catch(() => {});
      }
    } catch (e) {
      console.error('[ShiftsStore] fetch exception:', e);
    }
    set({ isLoading: false });
  },

  addShift: async (item, hourlyWage) => {
    const user = useAuthStore.getState().user;
    if (!user) return { message: 'ログインが必要です' };

    const estimated_wage = calcWage(hourlyWage, item.start_time, item.end_time, item.break_minutes ?? 0);
    const { data, error } = await supabase
      .from('shifts')
      .insert({ ...item, user_id: user.id, estimated_wage })
      .select('*, workplace:workplaces(*)')
      .single();

    if (error) {
      console.error('[ShiftsStore] add error:', error.code, error.message, error.hint);
    } else if (data) {
      const typed = data as unknown as ShiftWithWorkplace;
      const next = [...get().shifts, typed]
        .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
      set({ shifts: next });
      AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next)).catch(() => {});
      // バイト開始30分前の通知を登録
      scheduleShiftNotification({
        id:             typed.id,
        date:           typed.date,
        start_time:     typed.start_time,
        workplace_name: typed.workplace?.name ?? null,
      }).catch(() => {});
    }
    return error;
  },

  updateShift: async (id, updates, hourlyWage) => {
    const user = useAuthStore.getState().user;
    if (!user) return { message: 'ログインが必要です' };

    const existing = get().shifts.find(s => s.id === id);
    let patch: Partial<InsertShift> = { ...updates };
    if (hourlyWage !== undefined) {
      const st = updates.start_time ?? existing?.start_time ?? '09:00';
      const et = updates.end_time   ?? existing?.end_time   ?? '18:00';
      const bm = updates.break_minutes ?? existing?.break_minutes ?? 0;
      patch.estimated_wage = calcWage(hourlyWage, st, et, bm);
    }

    const { data, error } = await supabase
      .from('shifts').update(patch).eq('id', id)
      .select('*, workplace:workplaces(*)').single();
    if (error) {
      console.error('[ShiftsStore] update error:', error.code, error.message);
    } else if (data) {
      const typed = data as unknown as ShiftWithWorkplace;
      const next = get().shifts.map(s => s.id === id ? typed : s)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
      set({ shifts: next });
      AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next)).catch(() => {});
      // 日時が変わった可能性があるため、古い通知をキャンセルして再登録
      cancelShiftNotification(id).catch(() => {});
      scheduleShiftNotification({
        id:             typed.id,
        date:           typed.date,
        start_time:     typed.start_time,
        workplace_name: typed.workplace?.name ?? null,
      }).catch(() => {});
    }
    return error;
  },

  deleteShift: async (id) => {
    const user = useAuthStore.getState().user;
    if (!user) return { message: 'ログインが必要です' };

    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) {
      console.error('[ShiftsStore] delete error:', error.code, error.message);
    } else {
      const next = get().shifts.filter(s => s.id !== id);
      set({ shifts: next });
      AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next)).catch(() => {});
      // 削除されたシフトの通知をキャンセル
      cancelShiftNotification(id).catch(() => {});
    }
    return error;
  },

  getForMonth: (year, month) => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return get().shifts.filter(s => s.date.startsWith(prefix));
  },
  getMonthlyEstimate: (year, month) =>
    get().getForMonth(year, month).reduce((sum, s) => sum + (s.estimated_wage ?? 0), 0),
  getForDate: (date) =>
    get().shifts.filter(s => s.date === date),
  getNextShift: () => {
    const today = new Date().toISOString().split('T')[0];
    const upcoming = get().shifts.filter(s => s.date >= today);
    return upcoming.length > 0 ? upcoming[0] : null;
  },
}));
