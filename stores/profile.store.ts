import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';

const cacheKey = (uid: string) => `campas_profile_${uid}`;

interface ProfileState {
  displayName: string | null;
  isLoading:   boolean;

  fetch:  () => Promise<void>;
  update: (name: string) => Promise<{ error?: string }>;
}

export const useProfileStore = create<ProfileState>((set) => ({
  displayName: null,
  isLoading:   false,

  fetch: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    set({ isLoading: true });

    // キャッシュから先に反映
    try {
      const cached = await AsyncStorage.getItem(cacheKey(user.id));
      if (cached !== null) set({ displayName: cached || null, isLoading: false });
    } catch { /* ignore */ }

    // Supabase から最新取得
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!error) {
        const name = data?.display_name ?? null;
        set({ displayName: name });
        await AsyncStorage.setItem(cacheKey(user.id), name ?? '');
      }
    } catch { /* ignore */ }

    set({ isLoading: false });
  },

  update: async (name: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return { error: 'ログインが必要です' };

    const trimmed = name.trim();
    if (trimmed.length === 0) return { error: '名前を入力してください' };
    if (trimmed.length > 30)  return { error: '30文字以内で入力してください' };

    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, display_name: trimmed }, { onConflict: 'user_id' });

    if (error) return { error: error.message };

    set({ displayName: trimmed });
    await AsyncStorage.setItem(cacheKey(user.id), trimmed).catch(() => {});
    return {};
  },
}));
