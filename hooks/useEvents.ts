import { useEffect } from 'react';

import { useAuthStore } from '@/stores/auth.store';
import { useEventsStore, AppEvent } from '@/stores/events.store';
import type { Database, EventType } from '@/types/database';

export type { AppEvent } from '@/stores/events.store';

type InsertEvent = Database['public']['Tables']['events']['Insert'];

export const EVENT_CONFIG: Record<EventType, {
  label: string; color: string; bg: string; emoji: string; canComplete: boolean;
}> = {
  assignment:   { label: '課題',     color: '#F59E0B', bg: '#FFFBEB', emoji: '📝', canComplete: true  },
  test:         { label: 'テスト',   color: '#EF4444', bg: '#FEF2F2', emoji: '📊', canComplete: true  },
  report:       { label: 'レポート', color: '#8B5CF6', bg: '#F5F3FF', emoji: '📄', canComplete: true  },
  school_event: { label: '学校行事', color: '#3B82F6', bg: '#EFF6FF', emoji: '🏫', canComplete: false },
  circle:       { label: 'サークル', color: '#EC4899', bg: '#FDF2F8', emoji: '🎭', canComplete: false },
  personal:     { label: '個人予定', color: '#6366F1', bg: '#EEF2FF', emoji: '📅', canComplete: false },
  class_cancel: { label: '休講',     color: '#9CA3AF', bg: '#F9FAFB', emoji: '🚫', canComplete: false },
  class_makeup: { label: '補講',     color: '#059669', bg: '#ECFDF5', emoji: '📚', canComplete: false },
  other:        { label: 'その他',   color: '#6B7280', bg: '#F9FAFB', emoji: '📌', canComplete: false },
};

export function useEvents() {
  const { user } = useAuthStore();
  const store    = useEventsStore();

  // ユーザーが確定したタイミングで初回フェッチ
  useEffect(() => {
    if (user) store.fetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── ヘルパー ────────────────────────────────────────────
  const getForMonth = (year: number, month: number): AppEvent[] => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return store.events.filter(e => e.start_date.startsWith(prefix));
  };

  const getForDate = (date: string): AppEvent[] =>
    store.events.filter(e =>
      e.start_date === date ||
      (e.end_date && e.start_date <= date && e.end_date >= date),
    );

  const getUpcoming = (days = 7): AppEvent[] => {
    const today    = new Date().toISOString().split('T')[0];
    const limit    = new Date(); limit.setDate(limit.getDate() + days);
    const limitStr = limit.toISOString().split('T')[0];
    return store.events.filter(e =>
      !e.is_done &&
      e.start_date >= today &&
      e.start_date <= limitStr &&
      EVENT_CONFIG[e.event_type].canComplete,
    );
  };

  return {
    events:      store.events,
    isLoading:   store.isLoading,
    addEvent:    store.addEvent,
    updateEvent: store.updateEvent,
    deleteEvent: store.deleteEvent,
    toggleDone:  store.toggleDone,
    getForMonth, getForDate, getUpcoming,
    refresh:     store.fetch,
  };
}
