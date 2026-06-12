import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { supabase } from '@/lib/supabase';
import { configureRevenueCat } from '@/lib/revenuecat';
import {
  initNotificationHandler,
  registerNotificationCategories,
  requestNotificationPermission,
} from '@/lib/notifications';
import { useAuthStore } from '@/stores/auth.store';
import { useEntitlementStore } from '@/stores/entitlement.store';
import { useProfileStore } from '@/stores/profile.store';

// セッション確認完了までスプラッシュを保持する
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { session, isLoading, setSession } = useAuthStore();
  const { refresh: refreshEntitlements } = useEntitlementStore();
  const { fetch: fetchProfile } = useProfileStore();
  const segments = useSegments();
  const router = useRouter();

  // セッション初期化
  useEffect(() => {
    initNotificationHandler();
    registerNotificationCategories().catch(() => {});
    requestNotificationPermission().catch(() => {});

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        configureRevenueCat(session.user.id)
          .then(refreshEntitlements)
          .catch(() => {});
        fetchProfile().catch(() => {});
      }
    }).catch(() => setSession(null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        configureRevenueCat(session.user.id)
          .then(refreshEntitlements)
          .catch(() => {});
        fetchProfile().catch(() => {});
      }
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/(auth)/reset-password' as never);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 認証状態確定後にナビゲーション + スプラッシュ非表示
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }

    SplashScreen.hideAsync();
  }, [session, isLoading]);

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
