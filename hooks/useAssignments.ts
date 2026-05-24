import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  cancelAssignmentNotifications,
  rescheduleAllNotifications,
  scheduleAssignmentNotifications,
} from '@/lib/notifications';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

type Assignment = Database['public']['Tables']['assignments']['Row'];
type InsertAssignment = Database['public']['Tables']['assignments']['Insert'];

/** AIライクな優先度スコア（高いほど上に表示） */
export function calcPriorityScore(a: Assignment): number {
  let base = 0;
  if (a.due_date) {
    const days = Math.ceil(
      (new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (days < 0)      base = 10000 + Math.abs(days) * 10; // 期限切れ
    else if (days === 0) base = 9000;
    else if (days === 1) base = 8000;
    else if (days <= 3)  base = 7000;
    else if (days <= 7)  base = 6000;
    else if (days <= 14) base = 5000;
    else                 base = 4000;
  } else {
    base = 1000; // 締切なし
  }
  const priorityBonus = { high: 500, medium: 250, low: 0 }[a.priority ?? 'low'] ?? 0;
  return base + priorityBonus;
}

export function useAssignments() {
  const { user } = useAuthStore();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from('assignments')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'done');
    const sorted = (data ?? []).sort((a, b) => calcPriorityScore(b) - calcPriorityScore(a));
    setAssignments(sorted);
    // 通知スケジュールは開発ビルド（本番）でのみ有効にする
    if (!__DEV__) {
      rescheduleAllNotifications(sorted).catch(() => {});
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const addAssignment = async (item: Omit<InsertAssignment, 'user_id'>) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('assignments')
      .insert({ ...item, user_id: user.id })
      .select()
      .single();
    if (!error && data) {
      const next = [...assignments, data].sort((a, b) => calcPriorityScore(b) - calcPriorityScore(a));
      setAssignments(next);
      scheduleAssignmentNotifications(data).catch(() => {});
    }
    return error;
  };

  const completeAssignment = async (id: string) => {
    const { error } = await supabase
      .from('assignments')
      .update({ status: 'done' })
      .eq('id', id);
    if (!error) {
      setAssignments(prev => prev.filter(a => a.id !== id));
      cancelAssignmentNotifications(id).catch(() => {});
    }
    return error;
  };

  const deleteAssignment = async (id: string) => {
    const { error } = await supabase.from('assignments').delete().eq('id', id);
    if (!error) {
      setAssignments(prev => prev.filter(a => a.id !== id));
      cancelAssignmentNotifications(id).catch(() => {});
    }
    return error;
  };

  return { assignments, isLoading, addAssignment, completeAssignment, deleteAssignment, refresh: fetch };
}
