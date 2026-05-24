import { useEffect } from 'react';

import { useAuthStore } from '@/stores/auth.store';
import { useWorkplacesStore, WORKPLACE_COLORS } from '@/stores/workplaces.store';

export type { Workplace } from '@/stores/workplaces.store';
export { WORKPLACE_COLORS };

export function useWorkplaces() {
  const { user } = useAuthStore();
  const store    = useWorkplacesStore();

  useEffect(() => {
    if (user) store.fetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return {
    workplaces:      store.workplaces,
    isLoading:       store.isLoading,
    addWorkplace:    store.addWorkplace,
    updateWorkplace: store.updateWorkplace,
    deleteWorkplace: store.deleteWorkplace,
    refresh:         store.fetch,
  };
}
