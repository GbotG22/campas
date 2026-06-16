import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

type Account = Database['public']['Tables']['accounts']['Row'];

/**
 * 口座残高（最小実装）。
 * ユーザーにつき1件の口座残高を手動入力で管理する。
 * 自動連携（PayPay/銀行）は行わない。
 */
export function useAccounts() {
  const { user } = useAuthStore();
  const [account,   setAccount]   = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1);
      setAccount(data && data.length > 0 ? data[0] : null);
    } catch { /* ignore */ }
    setIsLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  /** 残高を保存（既存があれば更新、なければ作成）。manual入力のみ */
  const setBalance = async (balance: number) => {
    if (!user) return;
    if (account) {
      const { data } = await supabase
        .from('accounts')
        .update({ balance, updated_at: new Date().toISOString() })
        .eq('id', account.id)
        .select()
        .single();
      if (data) setAccount(data);
    } else {
      const { data } = await supabase
        .from('accounts')
        .insert({ user_id: user.id, balance })
        .select()
        .single();
      if (data) setAccount(data);
    }
  };

  return {
    account,
    balance: account?.balance ?? null,
    isLoading,
    setBalance,
    refresh: fetch,
  };
}
