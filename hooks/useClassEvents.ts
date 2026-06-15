import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { cancelClassOccurrence, scheduleClassOccurrence } from '@/lib/notifications';
import { getDetailedNotificationSettings } from '@/lib/notificationSettings';
import type { PeriodConfig } from '@/hooks/usePeriodSettings';
import type { Database } from '@/types/database';

type TimetableSlot = Database['public']['Tables']['timetable_slots']['Row'];

export type ClassEvent  = Database['public']['Tables']['class_events']['Row'];
type InsertClassEvent   = Database['public']['Tables']['class_events']['Insert'];

export type EventType = ClassEvent['event_type'];

export const EVENT_CONFIG: Record<EventType, { label: string; color: string; bg: string; emoji: string }> = {
  cancel:       { label: '休講',   color: '#EF4444', bg: '#FEF2F2', emoji: '🚫' },
  makeup:       { label: '補講',   color: '#10B981', bg: '#ECFDF5', emoji: '📚' },
  test:         { label: 'テスト', color: '#F59E0B', bg: '#FFFBEB', emoji: '📝' },
  report:       { label: 'レポート', color: '#8B5CF6', bg: '#F5F3FF', emoji: '📄' },
  presentation: { label: '発表',   color: '#EC4899', bg: '#FDF2F8', emoji: '🎤' },
  other:        { label: 'その他', color: '#6B7280', bg: '#F9FAFB', emoji: '📌' },
};

/** 特定の授業スロット用（詳細画面） */
export function useClassEvents(slotId?: string) {
  const { user } = useAuthStore();
  const [events,    setEvents]    = useState<ClassEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!user || !slotId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('class_events')
        .select('*')
        .eq('slot_id', slotId)
        .eq('user_id', user.id)
        .order('date');
      if (!error && data) setEvents(data);
    } catch { /* ignore */ }
    setIsLoading(false);
  }, [user, slotId]);

  useEffect(() => { fetch(); }, [fetch]);

  // ── 追加 ──────────────────────────────────────────────────────
  const addEvent = async (item: Omit<InsertClassEvent, 'user_id' | 'slot_id'>) => {
    if (!user || !slotId) return null;
    const { data, error } = await supabase
      .from('class_events')
      .insert({ ...item, user_id: user.id, slot_id: slotId })
      .select()
      .single();
    if (!error && data) {
      setEvents(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)));
    }
    return error;
  };

  // ── 更新 ──────────────────────────────────────────────────────
  const updateEvent = async (id: string, updates: Partial<InsertClassEvent>) => {
    const { data, error } = await supabase
      .from('class_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) {
      setEvents(prev => prev.map(e => e.id === id ? data : e).sort((a, b) => a.date.localeCompare(b.date)));
    }
    return error;
  };

  // ── 削除 ──────────────────────────────────────────────────────
  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from('class_events').delete().eq('id', id);
    if (!error) setEvents(prev => prev.filter(e => e.id !== id));
    return error;
  };

  return { events, isLoading, addEvent, updateEvent, deleteEvent, refresh: fetch };
}

/**
 * 指定日の休講・補講を複数スロット横断で購読し、休講のトグルもできるフック。
 * ホーム画面「今日の授業」で使用。class_events を単一の真実とすることで、
 * 時間割画面と表示が常に一致する。
 */
export function useTodayClassEvents(
  slotIds: string[],
  date: string,
  slots?: TimetableSlot[],
  periodConfig?: PeriodConfig,
) {
  const { user } = useAuthStore();
  const [todayEvents, setTodayEvents] = useState<Map<string, ClassEvent>>(new Map());

  // slotIds の同一性を安定させるためのキー
  const idsKey = slotIds.join(',');

  const refresh = useCallback(() => {
    if (!user || !slotIds.length) { setTodayEvents(new Map()); return; }
    fetchTodayEvents(user.id, slotIds, date).then(setTodayEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, idsKey, date]);

  useEffect(() => { refresh(); }, [refresh]);

  /** 休講のオン/オフを切り替える（補講が登録済みなら置き換える） */
  const toggleCancel = async (slotId: string) => {
    if (!user) return;
    const existing = todayEvents.get(slotId);
    if (existing?.event_type === 'cancel') {
      // 休講を解除 → その日の授業通知を再予約（未来時刻・通知ONのときのみ）
      await supabase.from('class_events').delete().eq('id', existing.id);
      const slot = slots?.find(s => s.id === slotId);
      if (slot && periodConfig) {
        getDetailedNotificationSettings()
          .then(s => scheduleClassOccurrence(slot, periodConfig, s.classMinutes, new Date(`${date}T00:00:00`)))
          .catch(() => {});
      }
    } else {
      if (existing) await supabase.from('class_events').delete().eq('id', existing.id);
      await supabase.from('class_events').insert({
        user_id: user.id, slot_id: slotId, date, event_type: 'cancel', title: '休講',
      });
      // 休講登録 → その日の授業通知だけをキャンセル
      cancelClassOccurrence(slotId, date).catch(() => {});
    }
    refresh();
  };

  return { todayEvents, toggleCancel, refresh };
}

/** 今日の休講・補講を全スロット横断で取得（時間割グリッド用） */
export async function fetchTodayEvents(
  userId: string,
  slotIds: string[],
  date: string,
): Promise<Map<string, ClassEvent>> {
  if (!slotIds.length) return new Map();
  try {
    const { data } = await supabase
      .from('class_events')
      .select('*')
      .eq('user_id', userId)
      .in('slot_id', slotIds)
      .eq('date', date)
      .in('event_type', ['cancel', 'makeup']);
    const map = new Map<string, ClassEvent>();
    data?.forEach(e => map.set(e.slot_id, e));
    return map;
  } catch {
    return new Map();
  }
}
