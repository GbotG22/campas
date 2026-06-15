import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PixelRatio } from 'react-native';

import { useAuthStore } from '@/stores/auth.store';
import { COLORS } from '@/constants/theme';

export default function TabsLayout() {
  const { session, isLoading: authLoading } = useAuthStore();
  // Dynamic Type 対策: OSの文字倍率（最大1.3でクランプ）に応じてタブバー高さを伸ばし
  // ラベルの見切れを防ぐ。
  const fontScale = Math.min(PixelRatio.getFontScale(), 1.3);
  const tabBarHeight = Math.round(60 * fontScale);
  const tabBarPaddingBottom = Math.round(6 * fontScale);

  // ルートレイアウトがナビゲーション制御するので、ローディング中は何も描画しない
  if (authLoading) return null;

  // セカンダリ保護：万が一未ログインで tabs に到達した場合
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray400,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor:  COLORS.gray100,
          borderTopWidth:  1,
          paddingBottom:   tabBarPaddingBottom,
          paddingTop:      4,
          height:          tabBarHeight,
        },
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '600',
        },
      }}
    >
      {/* ホーム：無料 */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />

      {/* 時間割：無料 */}
      <Tabs.Screen
        name="timetable"
        options={{
          title: '時間割',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />

      {/* 予定：無料 */}
      <Tabs.Screen
        name="schedule"
        options={{
          title: '予定',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'list' : 'list-outline'} size={size} color={color} />
          ),
        }}
      />

      {/* お金：無料 */}
      <Tabs.Screen
        name="money"
        options={{
          title: 'お金',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={size} color={color} />
          ),
        }}
      />

      {/* 設定：無料 */}
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
          ),
        }}
      />

      {/* 旧タブ：タブバーに表示しないが routes は保持 */}
      <Tabs.Screen name="assignments" options={{ href: null }} />
      <Tabs.Screen name="expenses"    options={{ href: null }} />
    </Tabs>
  );
}
