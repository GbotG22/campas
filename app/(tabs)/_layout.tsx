import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '@/stores/auth.store';
import { COLORS } from '@/constants/theme';

export default function TabsLayout() {
  const { session, isLoading: authLoading } = useAuthStore();

  // 未ログインならログイン画面へリダイレクト
  if (!authLoading && !session) {
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
          paddingBottom:   6,
          paddingTop:      4,
          height:          60,
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
