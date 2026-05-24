import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { supabase } from '@/lib/supabase';
import { initRevenueCat } from '@/lib/revenuecat';
import { initNotificationHandler, registerNotificationCategories } from '@/lib/notifications';
import { useAuthStore } from '@/stores/auth.store';
import { useEntitlementStore } from '@/stores/entitlement.store';

export default function RootLayout() {
  const { setSession } = useAuthStore();
  const { refresh: refreshEntitlements } = useEntitlementStore();

  useEffect(() => {
    // 通知ハンドラー・カテゴリ登録（失敗しても続行）
    initNotificationHandler();
    registerNotificationCategories().catch(() => {});

    // Supabase セッション取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        // RevenueCat 初期化（Expo Go では no-op）
        initRevenueCat(session.user.id)
          .then(refreshEntitlements)
          .catch(() => {});
      }
    }).catch(() => {});

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        initRevenueCat(session.user.id)
          .then(refreshEntitlements)
          .catch(() => {});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
