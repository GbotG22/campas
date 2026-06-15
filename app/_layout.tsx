// Dynamic Type 対策（Text/TextInput に maxFontSizeMultiplier=1.2 を全体適用）
// 他モジュールより先に評価させるため先頭で import する
import '@/lib/fontScaling';

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';
import { configureRevenueCat } from '@/lib/revenuecat';
import {
  initNotificationHandler,
  registerNotificationCategories,
  requestNotificationPermission,
  refreshClassNotificationsFromDB,
} from '@/lib/notifications';
import { todayYMD } from '@/lib/dateUtils';
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

  // 授業通知の補充（個別DATE方式）。日付が変わったタイミングのみ再予約し、
  // ウィンドウ外の先の週を補充する。起動時にも一度走らせる。
  const lastClassRefreshDate = useRef<string>('');
  useEffect(() => {
    const run = () => {
      const today = todayYMD();
      if (lastClassRefreshDate.current === today) return;
      lastClassRefreshDate.current = today;
      refreshClassNotificationsFromDB().catch(() => {});
    };
    run();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, []);

  // パスワードリセット等のディープリンク処理
  // メールリンク → camply://reset-password#access_token=...&type=recovery
  // implicit フローのトークンは URL フラグメントに乗るため手動で setSession する
  // （React Native では detectSessionInUrl が効かないため）
  useEffect(() => {
    async function handleUrl(url: string | null) {
      if (!url) return;
      const hashIndex = url.indexOf('#');
      if (hashIndex === -1) return;
      const params = new URLSearchParams(url.slice(hashIndex + 1));
      const access_token  = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      const type          = params.get('type');
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!error && type === 'recovery') {
          router.replace('/(auth)/reset-password' as never);
        }
      }
    }

    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  // 認証状態確定後にナビゲーション + スプラッシュ非表示
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup    = segments[0] === '(auth)';
    const onResetPassword = (segments[1] as string) === 'reset-password';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup && !onResetPassword) {
      // リセット中（recovery セッション）はリダイレクトしない
      router.replace('/(tabs)');
    } else {
      // リダイレクト不要 = 既に正しい画面 → ここで初めてスプラッシュを隠す
      // （リダイレクト前に隠すとログイン画面などが一瞬チラつくため）
      SplashScreen.hideAsync();
    }
  }, [session, isLoading, segments]);

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
