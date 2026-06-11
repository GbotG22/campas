import { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

interface AuthState {
  session:  Session | null;
  user:     User | null;
  isLoading: boolean;
  setSession:    (session: Session | null) => void;
  refreshUser:   () => Promise<void>;
  signOut:       () => Promise<void>;
  /**
   * 現在ログイン中のユーザーのアカウントとデータを完全削除する。
   *
   * - Supabase Auth の admin.deleteUser は service role key が必要なため
   *   クライアントからは直接呼べない。
   * - 代わりに DB 関数 `delete_user()` (SECURITY DEFINER) を RPC で呼ぶ。
   * - auth.uid() により「自分のアカウントのみ」削除される。
   * - 削除後は自動的にサインアウトする。
   *
   * @throws 削除失敗時は Error をスロー（呼び出し元で catch すること）
   */
  deleteAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session:   null,
  user:      null,
  isLoading: true,

  setSession: (session) =>
    set({ session, user: session?.user ?? null, isLoading: false }),

  refreshUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) set({ user });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },

  deleteAccount: async () => {
    // DB 関数 delete_user() を呼ぶ（SECURITY DEFINER で自分だけ削除）
    // 型定義に存在しないため as never でキャスト
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('delete_user');
    if (error) throw new Error(error.message);

    // 削除成功後にクライアント側のセッションもクリア
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
