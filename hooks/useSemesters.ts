import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

type Semester       = Database['public']['Tables']['semesters']['Row'];
type InsertSemester = Database['public']['Tables']['semesters']['Insert'];

const cacheKey = (uid: string) => `campas_semesters_${uid}`;

export function useSemesters() {
  const { user } = useAuthStore();
  const [semesters,       setSemesters]       = useState<Semester[]>([]);
  const [activeSemester,  setActiveSemester]  = useState<Semester | null>(null);
  const [isLoading,       setIsLoading]       = useState(true);

  // ── フェッチ ──────────────────────────────────────────────────
  const fetch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    // キャッシュを先に表示
    try {
      const cached = await AsyncStorage.getItem(cacheKey(user.id));
      if (cached) {
        const data: Semester[] = JSON.parse(cached);
        setSemesters(data);
        setActiveSemester(data.find(s => s.is_active) ?? null);
        setIsLoading(false);
      }
    } catch { /* ignore */ }

    // Supabase から最新取得
    try {
      const { data, error } = await supabase
        .from('semesters')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order')
        .order('created_at');
      if (!error && data) {
        setSemesters(data);
        setActiveSemester(data.find(s => s.is_active) ?? null);
        await AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(data));
      }
    } catch { /* ignore */ }

    setIsLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  // ── 追加 ────────────────────────────────────────────────────
  const addSemester = async (
    item: Omit<InsertSemester, 'user_id'>,
  ): Promise<{ error: unknown | null; data: Semester | null }> => {
    if (!user) return { error: 'not logged in', data: null };

    const { data, error } = await supabase
      .from('semesters')
      .insert({ ...item, user_id: user.id, sort_order: item.sort_order ?? semesters.length })
      .select()
      .single();

    if (!error && data) {
      const next = [...semesters, data].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
      setSemesters(next);
      await AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(next));
    }
    return { error, data: data ?? null };
  };

  // ── 更新 ────────────────────────────────────────────────────
  const updateSemester = async (id: string, updates: Partial<InsertSemester>) => {
    const { data, error } = await supabase
      .from('semesters')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) {
      const next = semesters.map(s => s.id === id ? data : s);
      setSemesters(next);
      if (data.is_active) setActiveSemester(data);
      await AsyncStorage.setItem(cacheKey(user!.id), JSON.stringify(next));
    }
    return error;
  };

  // ── 削除 ────────────────────────────────────────────────────
  const deleteSemester = async (id: string) => {
    const { error } = await supabase.from('semesters').delete().eq('id', id);
    if (!error) {
      const next = semesters.filter(s => s.id !== id);
      setSemesters(next);
      if (activeSemester?.id === id) setActiveSemester(null);
      await AsyncStorage.setItem(cacheKey(user!.id), JSON.stringify(next));
    }
    return error;
  };

  // ── アクティブ切り替え ──────────────────────────────────────
  const setActive = async (id: string | null) => {
    if (!user) return;
    // 全件 is_active = false → 指定した id のみ true
    await supabase.from('semesters').update({ is_active: false }).eq('user_id', user.id);
    if (id) await supabase.from('semesters').update({ is_active: true }).eq('id', id);
    await fetch();
  };

  // ── 既存スロットをこの学期に一括割り当て ────────────────────
  // 移行先で既に埋まっている (曜日,時限) には移行しない（同セル重複コマを作らない）
  const assignUnassignedSlots = async (semesterId: string) => {
    if (!user) return;
    // 移行先（対象学期）で既に使われている (曜日,時限)
    const { data: existing } = await supabase
      .from('timetable_slots')
      .select('day_of_week,period')
      .eq('user_id', user.id)
      .eq('semester_id', semesterId);
    const occupied = new Set((existing ?? []).map(s => `${s.day_of_week}_${s.period}`));

    // 未割り当て(null)スロットのうち、移行先が空いているコマだけ移行
    const { data: nulls } = await supabase
      .from('timetable_slots')
      .select('id,day_of_week,period')
      .eq('user_id', user.id)
      .is('semester_id', null);
    const migratable = (nulls ?? []).filter(s => !occupied.has(`${s.day_of_week}_${s.period}`));
    if (migratable.length === 0) return;

    await supabase
      .from('timetable_slots')
      .update({ semester_id: semesterId })
      .in('id', migratable.map(s => s.id));
  };

  return {
    semesters,
    activeSemester,
    isLoading,
    addSemester,
    updateSemester,
    deleteSemester,
    setActive,
    assignUnassignedSlots,
    refresh: fetch,
  };
}
