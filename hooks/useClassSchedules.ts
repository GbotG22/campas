import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

export type ClassSchedule = Database['public']['Tables']['class_schedules']['Row'];
type InsertClassSchedule  = Database['public']['Tables']['class_schedules']['Insert'];

export function useClassSchedules(slotId: string) {
  const { user } = useAuthStore();
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!user || !slotId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('class_schedules')
        .select('*')
        .eq('slot_id', slotId)
        .eq('user_id', user.id)
        .order('session_number');
      if (!error && data) setSchedules(data);
    } catch { /* ignore */ }
    setIsLoading(false);
  }, [user, slotId]);

  useEffect(() => { fetch(); }, [fetch]);

  // ── 追加 ──────────────────────────────────────────────────
  const addSchedule = async (item: Omit<InsertClassSchedule, 'user_id' | 'slot_id'>) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('class_schedules')
      .insert({ ...item, user_id: user.id, slot_id: slotId })
      .select()
      .single();
    if (!error && data) {
      setSchedules(prev => [...prev, data].sort((a, b) => a.session_number - b.session_number));
    }
    return error;
  };

  // ── 更新 ──────────────────────────────────────────────────
  const updateSchedule = async (id: string, updates: Partial<InsertClassSchedule>) => {
    const { data, error } = await supabase
      .from('class_schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) {
      setSchedules(prev =>
        prev.map(s => s.id === id ? data : s).sort((a, b) => a.session_number - b.session_number),
      );
    }
    return error;
  };

  // ── 削除 ──────────────────────────────────────────────────
  const deleteSchedule = async (id: string) => {
    const { error } = await supabase.from('class_schedules').delete().eq('id', id);
    if (!error) setSchedules(prev => prev.filter(s => s.id !== id));
    return error;
  };

  /** 次の未実施回（今日以降に date がある、または date なし）の番号 */
  const nextSessionNumber = () => {
    if (!schedules.length) return 1;
    return Math.max(...schedules.map(s => s.session_number)) + 1;
  };

  return { schedules, isLoading, addSchedule, updateSchedule, deleteSchedule, nextSessionNumber, refresh: fetch };
}
