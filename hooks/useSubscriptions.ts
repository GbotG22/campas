import { useEffect } from 'react';

import { useAuthStore } from '@/stores/auth.store';
import { useSubscriptionsStore } from '@/stores/subscriptions.store';

/**
 * サブスク用フック。
 * 内部状態は Zustand ストア（useSubscriptionsStore）に集約しているため、
 * このフックを複数コンポーネントで呼び出しても同じ state を共有する。
 * → ホーム画面と支出画面がリアルタイムに同期される。
 */
export function useSubscriptions() {
  const { user } = useAuthStore();
  const store    = useSubscriptionsStore();

  // ユーザーが確定したタイミングで初回フェッチ
  useEffect(() => {
    if (user) store.fetch();
  // store.fetch は参照が変わらないため依存に入れない
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return {
    subscriptions:      store.subscriptions,
    isLoading:          store.isLoading,
    monthlyTotal:       store.monthlyTotal,
    addSubscription:    store.addSubscription,
    updateSubscription: store.updateSubscription,
    deleteSubscription: store.deleteSubscription,
    refresh:            store.fetch,
  };
}
