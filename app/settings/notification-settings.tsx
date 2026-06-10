import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  DEFAULT_DETAILED_SETTINGS,
  DetailedNotificationSettings,
  MinuteOption,
  getDetailedNotificationSettings,
  saveDetailedNotificationSettings,
} from '@/lib/notificationSettings';
import {
  rescheduleAllShiftNotifications,
  rescheduleSubscriptionNotifications,
  rescheduleAllEventNotifications,
  rescheduleAllPaydayNotifications,
  rescheduleAllFixedExpenseNotifications,
} from '@/lib/notifications';
import { useShifts } from '@/hooks/useShifts';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { useEvents } from '@/hooks/useEvents';
import { useWorkplaces } from '@/hooks/useWorkplaces';
import { useFixedExpenses } from '@/hooks/useFixedExpenses';

const COLORS = {
  primary:    '#4F8EF7',
  background: '#F5F7FA',
  card:       '#FFFFFF',
  text:       '#1A1A2E',
  subtext:    '#6B7280',
  border:     '#E5E7EB',
  danger:     '#EF4444',
} as const;

type ShiftMinuteLabel = '通知なし' | '15分前' | '30分前' | '1時間前' | '2時間前';
type ClassMinuteLabel = '通知なし' | '15分前' | '30分前' | '1時間前';

const SHIFT_OPTIONS: { label: ShiftMinuteLabel; value: MinuteOption }[] = [
  { label: '通知なし', value: 0 },
  { label: '15分前',   value: 15 },
  { label: '30分前',   value: 30 },
  { label: '1時間前',  value: 60 },
  { label: '2時間前',  value: 120 },
];

const CLASS_OPTIONS: { label: ClassMinuteLabel; value: MinuteOption }[] = [
  { label: '通知なし', value: 0 },
  { label: '15分前',   value: 15 },
  { label: '30分前',   value: 30 },
  { label: '1時間前',  value: 60 },
];

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<DetailedNotificationSettings>(DEFAULT_DETAILED_SETTINGS);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);

  const { shifts }        = useShifts();
  const { subscriptions }   = useSubscriptions();
  const { events }          = useEvents();
  const { workplaces }      = useWorkplaces();
  const { fixedExpenses }   = useFixedExpenses();

  useEffect(() => {
    getDetailedNotificationSettings().then(s => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const applyAndSave = useCallback(async (next: DetailedNotificationSettings) => {
    setSettings(next);
    setSaving(true);
    try {
      await saveDetailedNotificationSettings(next);
      // 各カテゴリを即時再スケジュール（OFFにした場合はキャンセルも含む）
      await Promise.all([
        rescheduleAllShiftNotifications(
          shifts.map(s => ({
            id:             s.id,
            date:           s.date,
            start_time:     s.start_time,
            workplace_name: s.workplace?.name ?? null,
          })),
        ),
        rescheduleSubscriptionNotifications(subscriptions),
        rescheduleAllEventNotifications(events),
        rescheduleAllPaydayNotifications(workplaces),
        rescheduleAllFixedExpenseNotifications(fixedExpenses),
      ]);
    } finally {
      setSaving(false);
    }
  }, [shifts, subscriptions, events, workplaces, fixedExpenses]);

  const setMinutes = (
    key: 'shiftMinutes' | 'classMinutes',
    value: MinuteOption,
  ) => applyAndSave({ ...settings, [key]: value });

  const toggleBool = (key: keyof DetailedNotificationSettings) =>
    applyAndSave({ ...settings, [key]: !settings[key] });

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>通知設定</Text>
        {saving
          ? <ActivityIndicator size="small" color={COLORS.primary} style={styles.savingIndicator} />
          : <View style={styles.savingIndicator} />
        }
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* バイト通知 */}
        <SectionHeader title="バイト" icon="briefcase-outline" />
        <Card>
          <SegmentLabel label="開始前の通知タイミング" />
          <SegmentRow
            options={SHIFT_OPTIONS}
            value={settings.shiftMinutes}
            onChange={v => setMinutes('shiftMinutes', v)}
          />
        </Card>

        {/* 授業通知（保存のみ・スケジュール未実装） */}
        <SectionHeader title="授業" icon="school-outline" />
        <Card>
          <SegmentLabel label="開始前の通知タイミング" sub="※スケジュール機能実装後に有効化" />
          <SegmentRow
            options={CLASS_OPTIONS}
            value={settings.classMinutes}
            onChange={v => setMinutes('classMinutes', v)}
          />
        </Card>

        {/* 課題・テスト通知 */}
        <SectionHeader title="課題・テスト・レポート" icon="document-text-outline" />
        <Card>
          <CheckRow
            label="3日前"
            value={settings.events3d}
            onToggle={() => toggleBool('events3d')}
          />
          <Divider />
          <CheckRow
            label="前日"
            value={settings.events1d}
            onToggle={() => toggleBool('events1d')}
          />
          <Divider />
          <CheckRow
            label="当日"
            value={settings.events0d}
            onToggle={() => toggleBool('events0d')}
          />
        </Card>

        {/* 給料日通知 */}
        <SectionHeader title="給料日" icon="cash-outline" />
        <Card>
          <CheckRow
            label="3日前"
            value={settings.payday3d}
            onToggle={() => toggleBool('payday3d')}
          />
          <Divider />
          <CheckRow
            label="前日"
            value={settings.payday1d}
            onToggle={() => toggleBool('payday1d')}
          />
          <Divider />
          <CheckRow
            label="当日"
            value={settings.payday0d}
            onToggle={() => toggleBool('payday0d')}
          />
        </Card>

        {/* 固定費通知 */}
        <SectionHeader title="固定費" icon="home-outline" />
        <Card>
          <CheckRow
            label="前日"
            value={settings.fixed1d}
            onToggle={() => toggleBool('fixed1d')}
          />
        </Card>

        {/* サブスク通知 */}
        <SectionHeader title="サブスク更新" icon="refresh-circle-outline" />
        <Card>
          <CheckRow
            label="7日前"
            value={settings.sub7d}
            onToggle={() => toggleBool('sub7d')}
          />
          <Divider />
          <CheckRow
            label="3日前"
            value={settings.sub3d}
            onToggle={() => toggleBool('sub3d')}
          />
          <Divider />
          <CheckRow
            label="前日"
            value={settings.sub1d}
            onToggle={() => toggleBool('sub1d')}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

// ── サブコンポーネント ──────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon as any} size={14} color={COLORS.subtext} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function SegmentLabel({ label, sub }: { label: string; sub?: string }) {
  return (
    <View style={styles.segmentLabelRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      {sub && <Text style={styles.subNote}>{sub}</Text>}
    </View>
  );
}

function SegmentRow<T extends number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmentRow}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.segment, opt.value === value && styles.segmentActive]}
          onPress={() => onChange(opt.value)}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentText, opt.value === value && styles.segmentTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function CheckRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.checkRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.primary + '66' }}
        thumbColor={value ? COLORS.primary : '#FFFFFF'}
        ios_backgroundColor={COLORS.border}
      />
    </View>
  );
}

// ── スタイル ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },

  // ヘッダー
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    padding: 4,
    marginRight: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
  },
  savingIndicator: {
    width: 24,
    height: 24,
  },

  // コンテンツ
  content: {
    padding: 16,
    gap: 8,
  },

  // セクションヘッダー
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // カード
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 0,
  },

  // 行
  rowLabel: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '400',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },

  // セグメントコントロール
  segmentLabelRow: {
    paddingTop: 14,
    paddingBottom: 8,
    gap: 2,
  },
  subNote: {
    fontSize: 11,
    color: COLORS.subtext,
    marginTop: 2,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 14,
    flexWrap: 'wrap',
  },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  segmentActive: {
    backgroundColor: COLORS.primary + '18',
    borderColor: COLORS.primary,
  },
  segmentText: {
    fontSize: 13,
    color: COLORS.subtext,
    fontWeight: '400',
  },
  segmentTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});
