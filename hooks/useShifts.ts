import { useEffect } from 'react';

import { useAuthStore } from '@/stores/auth.store';
import {
  useShiftsStore,
  ShiftWithWorkplace,
  calcWage,
  calcWorkMinutes,
  formatMinutes,
  timeToMinutes,
} from '@/stores/shifts.store';
import type { Database } from '@/types/database';

export type { ShiftWithWorkplace } from '@/stores/shifts.store';
export { calcWage, calcWorkMinutes, formatMinutes, timeToMinutes };

export type Shift     = Database['public']['Tables']['shifts']['Row'];
export type Workplace = Database['public']['Tables']['workplaces']['Row'];

export function useShifts() {
  const { user } = useAuthStore();
  const store    = useShiftsStore();

  useEffect(() => {
    if (user) store.fetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return {
    shifts:    store.shifts,
    isLoading: store.isLoading,

    addShift:    store.addShift,
    updateShift: store.updateShift,
    deleteShift: store.deleteShift,

    getForMonth:       store.getForMonth,
    getMonthlyEstimate:store.getMonthlyEstimate,
    getForDate:        store.getForDate,

    refresh: store.fetch,
  };
}
