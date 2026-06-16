import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'early_leave' | 'official_absent';
export type AttendanceRecord = Database['public']['Tables']['attendance_records']['Row'];

export interface AttendanceStats {
  total:      number;
  present:    number;
  late:       number;
  absent:     number;
  earlyLeave: number;
  /** 出席率 0-100、記録なしなら null */
  rate:       number | null;
  /** あと何回休めるか（requiredRate 基準） */
  canSkip:    number;
  /** 出席率が基準を下回っているか */
  isWarning:  boolean;
}

export const ATT_CONFIG: Record<AttendanceStatus, { label: string; color: string; bg: string; short: string }> = {
  present:     { label: '出席',  short: '出', color: '#10B981', bg: '#ECFDF5' },
  late:        { label: '遅刻',  short: '遅', color: '#F59E0B', bg: '#FFFBEB' },
  absent:      { label: '欠席',  short: '欠', color: '#EF4444', bg: '#FEF2F2' },
  early_leave: { label: '早退',  short: '早', color: '#8B5CF6', bg: '#F5F3FF' },
  official_absent: { label: '公欠', short: '公', color: '#3B82F6', bg: '#EFF6FF' },
};

const cacheKey = (uid: string) => `campas_attendance_v2_${uid}`;

export function useAttendance() {
  const { user } = useAuthStore();
  const [records,   setRecords]   = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // O(1) lookup: key = `${slotId}_${date}`
  const byKey = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    records.forEach(r => map.set(`${r.slot_id}_${r.date}`, r));
    return map;
  }, [records]);

  // ── 初期ロード ─────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    // キャッシュを先に表示
    try {
      const cached = await AsyncStorage.getItem(cacheKey(user.id));
      if (cached) { setRecords(JSON.parse(cached)); setIsLoading(false); }
    } catch { /* ignore */ }

    // Supabase から全件取得
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      if (!error && data) {
        setRecords(data);
        await AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(data));
      }
    } catch { /* ignore */ }

    setIsLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── 記録（upsert） ─────────────────────────────────────────
  const record = async (
    slotId: string,
    date: string,
    status: AttendanceStatus,
    note?: string,
  ) => {
    if (!user) return;

    // 楽観的更新（即時 UI 反映）
    const tempKey = `${slotId}_${date}`;
    const existing = byKey.get(tempKey);
    const optimistic: AttendanceRecord = {
      id:         existing?.id ?? '_tmp',
      slot_id:    slotId,
      user_id:    user.id,
      date,
      status,
      note:       note ?? null,
      created_at: existing?.created_at ?? new Date().toISOString(),
    };
    setRecords(prev => {
      const next = prev.filter(r => `${r.slot_id}_${r.date}` !== tempKey);
      return [optimistic, ...next].sort((a, b) => b.date.localeCompare(a.date));
    });

    // Supabase へ upsert
    const { data, error } = await supabase
      .from('attendance_records')
      .upsert(
        { slot_id: slotId, user_id: user.id, date, status, note: note ?? null },
        { onConflict: 'slot_id,date' },
      )
      .select()
      .single();

    if (!error && data) {
      setRecords(prev => {
        const next = prev.filter(r => `${r.slot_id}_${r.date}` !== tempKey);
        const result = [data, ...next].sort((a, b) => b.date.localeCompare(a.date));
        // キャッシュ更新
        AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(result)).catch(() => {});
        return result;
      });
    }
  };

  // ── 削除 ──────────────────────────────────────────────────
  const deleteRecord = async (slotId: string, date: string) => {
    const existing = byKey.get(`${slotId}_${date}`);
    if (!existing) return;

    // 楽観的削除
    setRecords(prev => prev.filter(r => r.id !== existing.id));

    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', existing.id);

    if (error) load(); // 失敗したら再取得で戻す
    else {
      AsyncStorage.getItem(cacheKey(user!.id)).then(raw => {
        if (!raw) return;
        const arr: AttendanceRecord[] = JSON.parse(raw).filter((r: AttendanceRecord) => r.id !== existing.id);
        AsyncStorage.setItem(cacheKey(user!.id), JSON.stringify(arr)).catch(() => {});
      });
    }
  };

  // ── 特定日の出席状況 ───────────────────────────────────────
  const getForDate = (slotId: string, date: string): AttendanceStatus | null =>
    byKey.get(`${slotId}_${date}`)?.status ?? null;

  // ── スロットの全記録（詳細画面用） ────────────────────────
  const getRecordsForSlot = (slotId: string): AttendanceRecord[] =>
    records
      .filter(r => r.slot_id === slotId)
      .sort((a, b) => b.date.localeCompare(a.date));

  // ── 統計 ──────────────────────────────────────────────────
  /**
   * canSkip の計算
   * デフォルト総授業回数: 15回
   * 例) 15回 × 80% = 12回出席必要 → 休める上限 = 3回
   *
   * 遅刻/早退は "2回で1欠席" として換算。
   */
  const getStats = (
    slotId:        string,
    requiredRate = 80,
    totalSessions = 15,   // ← 学期の総授業回数（デフォルト15）
  ): AttendanceStats => {
    const allRecs    = records.filter(r => r.slot_id === slotId);
    // 公欠（official_absent）は免除扱い: 出席率の分母・欠席カウントから除外する
    const slotRecs   = allRecs.filter(r => r.status !== 'official_absent');
    const total      = slotRecs.length;
    const present    = slotRecs.filter(r => r.status === 'present').length;
    const late       = slotRecs.filter(r => r.status === 'late').length;
    const absent     = slotRecs.filter(r => r.status === 'absent').length;
    const earlyLeave = slotRecs.filter(r => r.status === 'early_leave').length;

    // 出席率計算：遅刻・早退は0.5出席扱い（公欠は分母に含めない）
    const attended = present + late * 0.5 + earlyLeave * 0.5;
    const rate     = total > 0 ? Math.round((attended / total) * 100) : null;

    // ─ あと何回休めるか ─
    // 許容欠席数 = floor(総授業回数 × (1 - requiredRate/100))
    //   例: 15 × (1 - 0.80) = 3
    const maxAbsences = Math.floor(totalSessions * (100 - requiredRate) / 100);

    // 実効欠席数（遅刻2回 = 欠席1回 として換算）
    const effectiveAbsences = absent + Math.floor((late + earlyLeave) / 2);

    const canSkip   = Math.max(0, maxAbsences - effectiveAbsences);
    const isWarning = (rate !== null && rate < requiredRate) || canSkip === 0;

    return { total, present, late, absent, earlyLeave, rate, canSkip, isWarning };
  };

  return {
    records, isLoading, load,
    record, deleteRecord,
    getForDate, getRecordsForSlot, getStats,
  };
}
