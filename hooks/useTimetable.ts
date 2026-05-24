import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

type Slot       = Database['public']['Tables']['timetable_slots']['Row'];
type InsertSlot = Database['public']['Tables']['timetable_slots']['Insert'];

const cacheKey = (uid: string, semId?: string | null) =>
  `campas_timetable_${uid}${semId ? `_${semId}` : '_all'}`;

/**
 * @param semesterId
 *   undefined → 全件（後方互換・学期未設定時）
 *   null      → semester_id が NULL のスロットのみ
 *   string    → 指定した学期のスロットのみ
 */
export function useTimetable(semesterId?: string | null) {
  const { user } = useAuthStore();
  const [slots,     setSlots]     = useState<Slot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  const saveCache = useCallback(async (data: Slot[]) => {
    if (!user) return;
    try { await AsyncStorage.setItem(cacheKey(user.id, semesterId), JSON.stringify(data)); }
    catch { /* ignore */ }
  }, [user, semesterId]);

  const fetch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    // 1. キャッシュを即座に表示（stale-while-revalidate）
    try {
      const cached = await AsyncStorage.getItem(cacheKey(user.id, semesterId));
      if (cached) { setSlots(JSON.parse(cached)); setIsLoading(false); }
    } catch { /* ignore */ }

    // 2. Supabase から最新を取得
    try {
      let query = supabase
        .from('timetable_slots')
        .select('*')
        .eq('user_id', user.id)
        .order('day_of_week')
        .order('period');

      // undefined = フィルタなし（全件）
      if (semesterId !== undefined) {
        if (semesterId === null) {
          query = query.is('semester_id', null);
        } else {
          query = query.eq('semester_id', semesterId);
        }
      }

      const { data, error } = await query;
      if (!error && data) {
        setSlots(data);
        setIsOffline(false);
        await saveCache(data);
      }
    } catch {
      setIsOffline(true); // ネットワーク不可 → キャッシュのまま表示
    }

    setIsLoading(false);
  }, [user, semesterId, saveCache]);

  useEffect(() => { fetch(); }, [fetch]);

  const addSlot = async (item: Omit<InsertSlot, 'user_id'>) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('timetable_slots')
      .insert({ ...item, user_id: user.id, semester_id: semesterId ?? null })
      .select()
      .single();
    if (!error && data) {
      const next = [...slots, data];
      setSlots(next);
      await saveCache(next);
    }
    return error;
  };

  const updateSlot = async (id: string, updates: Omit<InsertSlot, 'user_id'>) => {
    const { data, error } = await supabase
      .from('timetable_slots')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) {
      const next = slots.map(s => s.id === id ? data : s);
      setSlots(next);
      await saveCache(next);
    }
    return error;
  };

  const deleteSlot = async (id: string) => {
    const { error } = await supabase.from('timetable_slots').delete().eq('id', id);
    if (!error) {
      const next = slots.filter(s => s.id !== id);
      setSlots(next);
      await saveCache(next);
    }
    return error;
  };

  return { slots, isLoading, isOffline, addSlot, updateSlot, deleteSlot, refresh: fetch };
}
