import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import type { Json } from '@/types/database';

export interface PeriodTime {
  period: number;
  start:  string;  // "HH:MM"
  end:    string;  // "HH:MM"
}

export interface PeriodConfig {
  periodCount:  number;
  periods:      PeriodTime[];
  requiredRate: number;  // 出席率基準 0-100
}

export const DEFAULT_PERIODS: PeriodTime[] = [
  { period: 1, start: '08:50', end: '10:20' },
  { period: 2, start: '10:30', end: '12:00' },
  { period: 3, start: '13:00', end: '14:30' },
  { period: 4, start: '14:40', end: '16:10' },
  { period: 5, start: '16:20', end: '17:50' },
];

export const DEFAULT_CONFIG: PeriodConfig = {
  periodCount:  5,
  periods:      DEFAULT_PERIODS,
  requiredRate: 80,
};

const cacheKey = (uid: string) => `campas_period_settings_${uid}`;

export function usePeriodSettings() {
  const { user } = useAuthStore();
  const [config,    setConfig]    = useState<PeriodConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    // キャッシュ
    try {
      const cached = await AsyncStorage.getItem(cacheKey(user.id));
      if (cached) { setConfig(JSON.parse(cached)); setIsLoading(false); }
    } catch { /* ignore */ }

    // Supabase
    try {
      const { data, error } = await supabase
        .from('period_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (!error && data) {
        const cfg: PeriodConfig = {
          periodCount:  data.period_count,
          periods:      data.periods as unknown as PeriodTime[],
          requiredRate: data.required_rate,
        };
        setConfig(cfg);
        await AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(cfg));
      }
    } catch { /* ignore */ }

    setIsLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  /** 設定を保存（即時 + Supabase upsert） */
  const save = async (newConfig: PeriodConfig) => {
    if (!user) return;
    setConfig(newConfig);
    await AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(newConfig));

    await supabase.from('period_settings').upsert(
      {
        user_id:       user.id,
        period_count:  newConfig.periodCount,
        periods:       newConfig.periods as unknown as Json,
        required_rate: newConfig.requiredRate,
      },
      { onConflict: 'user_id' },
    );
  };

  /** 指定した時限数に合わせて periods 配列を正規化する */
  const buildPeriods = (count: number, base: PeriodTime[]): PeriodTime[] => {
    const result: PeriodTime[] = [];
    for (let i = 1; i <= count; i++) {
      const existing = base.find(p => p.period === i);
      result.push(existing ?? { period: i, start: '00:00', end: '00:00' });
    }
    return result;
  };

  return { config, isLoading, save, buildPeriods, refresh: fetch };
}
