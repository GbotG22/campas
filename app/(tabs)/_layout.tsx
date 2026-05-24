import { Redirect, Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '@/stores/auth.store';
import { useEntitlementStore } from '@/stores/entitlement.store';

export default function TabsLayout() {
  const { session, isLoading: authLoading } = useAuthStore();
  const {
    timetable, assignments, expenses,
    isLoading: entLoading,
  } = useEntitlementStore();
  const router = useRouter();

  if (!authLoading && !session) {
    return <Redirect href="/(auth)/login" />;
  }

  function gateListener(hasAccess: boolean, feature: string) {
    return {
      tabPress: (e: { preventDefault: () => void }) => {
        if (!entLoading && !hasAccess) {
          e.preventDefault();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.push(`/paywall/${feature}` as any);
        }
      },
    };
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
        headerShown: false,
      }}
    >
      {/* ホーム：無料 */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />

      {/* 時間割：課金が必要 */}
      <Tabs.Screen
        name="timetable"
        options={{
          title: '時間割',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={!entLoading && !timetable ? 'lock-closed-outline' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
        listeners={gateListener(timetable, 'timetable')}
      />

      {/* 予定（旧：課題）：課金が必要 */}
      <Tabs.Screen
        name="schedule"
        options={{
          title: '予定',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={!entLoading && !assignments ? 'lock-closed-outline' : 'list-outline'} size={size} color={color} />
          ),
        }}
        listeners={gateListener(assignments, 'assignments')}
      />

      {/* お金（旧：支出）：課金が必要 */}
      <Tabs.Screen
        name="money"
        options={{
          title: 'お金',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={!entLoading && !expenses ? 'lock-closed-outline' : 'wallet-outline'} size={size} color={color} />
          ),
        }}
        listeners={gateListener(expenses, 'expenses')}
      />

      {/* 旧タブ：タブバーに表示しないが routes は保持 */}
      <Tabs.Screen name="assignments" options={{ href: null }} />
      <Tabs.Screen name="expenses"    options={{ href: null }} />
    </Tabs>
  );
}
