/**
 * schedule.tsx — 予定・シフト管理画面
 *
 * ── AI機能拡張ポイント ──────────────────────────────────────────────
 * ScheduleItem の各フィールドはそのままAIへのプロンプト入力に使用できる:
 *  - title / description → 優先度スコアリング・類似予定サジェスト
 *  - date / time         → スケジュール最適化・空き時間提案
 *  - type / isDone       → 完了率予測・リマインダーパーソナライズ
 *  - raw                 → 元DBレコードを保持。AIプロンプト生成時に全フィールドを参照可能
 *
 * AI追加例:
 *  - getUpcoming() → 今後7日のイベントをAIに渡して「今週のまとめ」生成
 *  - ScheduleItem[] → GPT-4oへ送信して「いつレポートを書き始めるべきか」アドバイス
 * ──────────────────────────────────────────────────────────────────
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { COLORS, SPACING, RADIUS, SHADOW } from '@/constants/theme';
import InlineDatePicker from '@/components/InlineDatePicker';
import InlineTimePicker from '@/components/InlineTimePicker';
import MonthCalendar, { CalendarMarker } from '@/components/MonthCalendar';
import { useEvents, EVENT_CONFIG, AppEvent } from '@/hooks/useEvents';
import { useShifts, ShiftWithWorkplace, calcWage } from '@/hooks/useShifts';
import { useWorkplaces } from '@/hooks/useWorkplaces';
import {
  useGoogleCalendar, GCalEvent,
  gCalEventDate, gCalEventTime, gCalEventEndTime,
  IS_EXPO_GO,
} from '@/hooks/useGoogleCalendar';
import { useNativeCalendar, NativeCalEvent } from '@/hooks/useNativeCalendar';
import { useAI, AIScheduleItem } from '@/hooks/useAI';
import { usePremium } from '@/hooks/usePremium';
import type { EventType } from '@/types/database';
import { localYMD } from '@/lib/dateUtils';

function getToday()    { return localYMD(new Date()); }
function getTomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); return localYMD(d); }

const GCAL_COLOR   = '#4285F4'; // Google ブルー
const NATIVE_COLOR = '#34C759'; // Apple グリーン

// ── AI対応統一アイテム型 ────────────────────────────────────────────
interface ScheduleItem {
  id:          string;
  type:        EventType | 'shift' | 'google' | 'native';
  title:       string;
  date:        string;          // YYYY-MM-DD
  time:        string | null;   // HH:MM
  endTime:     string | null;   // HH:MM
  description: string | null;   // AI入力・ユーザーメモ
  isDone:      boolean;
  color:       string;
  sub:         string | null;   // 補足テキスト（給与見込みなど）
  source:      'event' | 'shift' | 'google' | 'native';
  raw:         AppEvent | ShiftWithWorkplace | GCalEvent | NativeCalEvent;
}

// 種類グループ（追加モーダルの表示用）
const TYPE_GROUPS: { label: string; types: (EventType | 'shift')[] }[] = [
  { label: '学校', types: ['assignment','test','report','school_event','class_cancel','class_makeup'] },
  { label: 'バイト', types: ['shift'] },
  { label: 'プライベート', types: ['personal','circle','other'] },
];

// 日付ラベル
function dateSectionLabel(date: string): string {
  if (date === getToday())    return `今日 · ${fmtShort(date)}`;
  if (date === getTomorrow()) return `明日 · ${fmtShort(date)}`;
  return fmtShort(date);
}
function fmtShort(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(date + 'T00:00:00');
  return `${d.getMonth()+1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
}

// ──────────────────────────────────────────────────────────────────
export default function ScheduleScreen() {
  const { events, addEvent, updateEvent, deleteEvent, toggleDone } = useEvents();
  const { shifts, addShift, updateShift, deleteShift }              = useShifts();
  const { workplaces }                                              = useWorkplaces();
  const {
    gCalEvents, isConnected: gcalConnected,
    isLoading: gcalLoading, error: gcalError,
    signIn: gcalSignIn, signOut: gcalSignOut,
  } = useGoogleCalendar();
  const {
    nativeEvents, isConnected: nativeConnected,
    isLoading: nativeLoading, error: nativeError,
    connect: nativeConnect, disconnect: nativeDisconnect,
  } = useNativeCalendar();
  const { isAnalyzing, advice, error: aiError, analyze, clear: clearAI } = useAI();
  const { isPremium, isAiPlus } = usePremium();
  const [aiModalVisible, setAiModalVisible] = useState(false);

  // ── 端末カレンダー詳細モーダル ────────────────────────────
  const [nativeDetailItem, setNativeDetailItem] = useState<ScheduleItem | null>(null);

  // ── カレンダー ─────────────────────────────────────────────
  const todayDate = new Date();
  const [calYear,  setCalYear]  = useState(todayDate.getFullYear());
  const [calMonth, setCalMonth] = useState(todayDate.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(getToday());

  // 画面フォーカス時に再描画し「今日」マークを最新化（日付またぎ対策）
  const [, forceUpdate] = useState(0);
  useFocusEffect(useCallback(() => { forceUpdate(n => n + 1); }, []));

  function prevMonth() {
    if (calMonth === 1) { setCalYear(y => y-1); setCalMonth(12); }
    else setCalMonth(m => m-1);
  }
  function nextMonth() {
    if (calMonth === 12) { setCalYear(y => y+1); setCalMonth(1); }
    else setCalMonth(m => m+1);
  }
  function handleDateSelect(date: string) {
    setSelectedDate(prev => prev === date ? null : date);
  }

  // ── 統一リスト生成 ─────────────────────────────────────────
  const allItems = useMemo((): ScheduleItem[] => {
    const result: ScheduleItem[] = [];

    // アプリ内イベント
    events.forEach(e => {
      const cfg = EVENT_CONFIG[e.event_type];
      result.push({
        id: e.id, type: e.event_type, title: e.title,
        date: e.start_date, time: e.start_time, endTime: e.end_time,
        description: e.description ?? null,
        isDone: e.is_done, color: cfg.color, sub: null,
        source: 'event', raw: e,
      });
    });

    // バイトシフト
    shifts.forEach(s => {
      result.push({
        id: s.id, type: 'shift',
        title: s.workplace?.name ?? 'バイト',
        date: s.date, time: s.start_time, endTime: s.end_time,
        description: s.note ?? null,
        isDone: false, color: s.workplace?.color ?? '#10B981',
        sub: s.estimated_wage != null ? `¥${s.estimated_wage.toLocaleString()}` : null,
        source: 'shift', raw: s,
      });
    });

    // Googleカレンダーイベント（読み取り専用）
    const gCalKeys = new Set<string>();
    gCalEvents.forEach(ev => {
      const date = gCalEventDate(ev);
      if (!date) return;
      const time = gCalEventTime(ev) ?? 'allday';
      gCalKeys.add(`${ev.summary ?? ''}:${date}:${time}`);
      result.push({
        id:          `gcal_${ev.id}`,
        type:        'google',
        title:       ev.summary ?? '（タイトルなし）',
        date,
        time:        gCalEventTime(ev),
        endTime:     gCalEventEndTime(ev),
        description: ev.description ?? null,
        isDone:      false,
        color:       GCAL_COLOR,
        sub:         null,
        source:      'google',
        raw:         ev,
      });
    });

    // 端末カレンダーイベント（読み取り専用、Gカレンダーと重複を除外）
    nativeEvents.forEach(ev => {
      const dedupKey = `${ev.title}:${ev.date}:${ev.time ?? 'allday'}`;
      if (gCalKeys.has(dedupKey)) return;
      result.push({
        id:          `native_${ev.id}`,
        type:        'native',
        title:       ev.title,
        date:        ev.date,
        time:        ev.time,
        endTime:     ev.endTime,
        description: ev.notes,
        isDone:      false,
        color:       ev.color,
        sub:         null,
        source:      'native',
        raw:         ev,
      });
    });

    return result.sort((a, b) =>
      a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''),
    );
  }, [events, shifts, gCalEvents, nativeEvents]);

  // 選択日でフィルタ
  const visibleItems = useMemo(() =>
    selectedDate ? allItems.filter(i => i.date === selectedDate) : allItems,
    [allItems, selectedDate],
  );

  // カレンダーマーカー
  const calMarkers = useMemo((): CalendarMarker[] => {
    const seen = new Set<string>();
    const result: CalendarMarker[] = [];
    allItems.forEach(i => {
      const key = `${i.date}_${i.color}`;
      if (!seen.has(key)) { seen.add(key); result.push({ date: i.date, color: i.color }); }
    });
    return result;
  }, [allItems]);

  // 日別グループ
  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    visibleItems.forEach(i => {
      const arr = map.get(i.date) ?? [];
      arr.push(i);
      map.set(i.date, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visibleItems]);

  // ── モーダル状態 ───────────────────────────────────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem,  setEditingItem]  = useState<ScheduleItem | null>(null);
  const [saving,       setSaving]       = useState(false);

  // フォーム共通
  const [shiftMode,      setShiftMode]      = useState(false);
  const [evType,         setEvType]         = useState<EventType>('assignment');
  const [evTitle,        setEvTitle]        = useState('');
  const [evDate,         setEvDate]         = useState(getToday());
  const [evTime,         setEvTime]         = useState('');
  const [evEndTime,      setEvEndTime]      = useState('');
  const [evDesc,         setEvDesc]         = useState('');
  const [shiftWorkplace, setShiftWorkplace] = useState('');
  const [shiftDate,      setShiftDate]      = useState(getToday());
  const [shiftStart,     setShiftStart]     = useState('');
  const [shiftEnd,       setShiftEnd]       = useState('');
  const [shiftBreak,     setShiftBreak]     = useState('0');
  // 通知タイミング（null = 通知なし、0 = 時刻通り、分単位）。イベント・シフト共用
  const [notifMin,       setNotifMin]       = useState<number | null>(null);

  // 追加モードで開く（選択日を自動セット）
  function openAdd(type: EventType | 'shift' = 'assignment') {
    setEditingItem(null);
    const date = selectedDate ?? getToday();
    if (type === 'shift') {
      setShiftMode(true);
      setShiftWorkplace(workplaces[0]?.id ?? '');
      setShiftDate(date); setShiftStart(''); setShiftEnd(''); setShiftBreak('0');
    } else {
      setShiftMode(false); setEvType(type);
      setEvTitle(''); setEvDate(date); setEvTime(''); setEvEndTime(''); setEvDesc('');
    }
    setNotifMin(null);
    setModalVisible(true);
  }

  // AI 分析を起動（AI Plus 限定）
  function openAI() {
    // AI Plus 未加入の場合はペイウォールへ
    if (!isAiPlus) {
      router.push('/paywall/ai_plus' as never);
      return;
    }

    const aiItems: AIScheduleItem[] = allItems
      .filter(i => i.source === 'event' || i.source === 'shift') // アプリ内予定のみ（外部カレンダーは除外）
      .map(i => {
        const cfg = i.type === 'shift'
          ? { label: 'バイト' }
          : EVENT_CONFIG[i.type as EventType] ?? { label: 'その他' };
        return {
          title:     i.title,
          typeLabel: cfg.label,
          date:      i.date,
          time:      i.time,
          endTime:   i.endTime,
          isDone:    i.isDone,
        };
      });
    clearAI();
    setAiModalVisible(true);
    analyze(aiItems);
  }

  // 編集モードで開く（Google・端末カレンダーイベントは読み取り専用）
  function openEdit(item: ScheduleItem) {
    if (item.source === 'google') {
      const timeStr = item.time
        ? `${item.time}${item.endTime ? ` 〜 ${item.endTime}` : ''}`
        : '終日';
      const lines = [timeStr];
      if (item.description) lines.push(item.description);
      lines.push('\nGoogleカレンダーのイベントは編集できません。');
      Alert.alert(item.title, lines.join('\n'), [{ text: '閉じる' }]);
      return;
    }
    if (item.source === 'native') {
      setNativeDetailItem(item);
      return;
    }
    setEditingItem(item);
    if (item.source === 'shift') {
      const s = item.raw as ShiftWithWorkplace;
      setShiftMode(true);
      setShiftWorkplace(s.workplace_id);
      setShiftDate(s.date);
      setShiftStart(s.start_time);
      setShiftEnd(s.end_time);
      setShiftBreak(String(s.break_minutes));
      setNotifMin(s.notification_enabled ? s.notification_minutes_before : null);
    } else {
      const e = item.raw as AppEvent;
      setShiftMode(false);
      setEvType(e.event_type);
      setEvTitle(e.title);
      setEvDate(e.start_date);
      setEvTime(e.start_time ?? '');
      setEvEndTime(e.end_time ?? '');
      setEvDesc(e.description ?? '');
      setNotifMin(e.notification_enabled ? e.notification_minutes_before : null);
    }
    setModalVisible(true);
  }

  // 保存（追加 or 更新）
  async function handleSave() {
    setSaving(true);
    let err: any = null;
    if (shiftMode) {
      if (!shiftWorkplace || !shiftStart || !shiftEnd) {
        Alert.alert('入力エラー', 'バイト先・開始・終了時刻は必須です');
        setSaving(false); return;
      }
      // 終了 <= 開始は翌日扱い（深夜またぎ。給与計算は calcWorkMinutes が +24h で対応済み）。
      // 完全に同時刻のみ、誤登録（24時間シフト）防止のためエラーにする
      if (shiftStart === shiftEnd) {
        Alert.alert('入力エラー', '開始時刻と終了時刻が同じです');
        setSaving(false); return;
      }
      const wp = workplaces.find(w => w.id === shiftWorkplace);
      const data = {
        workplace_id: shiftWorkplace, date: shiftDate,
        start_time: shiftStart, end_time: shiftEnd,
        break_minutes: parseInt(shiftBreak, 10) || 0, note: null as null,
        notification_enabled: notifMin !== null,
        notification_minutes_before: notifMin ?? 0,
      };
      err = editingItem
        ? await updateShift(editingItem.id, data, wp?.hourly_wage)
        : await addShift(data, wp?.hourly_wage ?? 1000);
    } else {
      if (!evTitle.trim()) {
        Alert.alert('入力エラー', 'タイトルを入力してください');
        setSaving(false); return;
      }
      // 開始・終了両方入力されていて終了が開始以前ならエラー
      if (evTime && evEndTime) {
        const [sh, sm] = evTime.split(':').map(Number);
        const [eh, em] = evEndTime.split(':').map(Number);
        if (sh * 60 + sm >= eh * 60 + em) {
          Alert.alert('入力エラー', '終了時刻は開始時刻より後にしてください');
          setSaving(false); return;
        }
      }
      const data = {
        event_type: evType, title: evTitle.trim(), start_date: evDate,
        start_time: evTime || null, end_time: evEndTime || null,
        description: evDesc.trim() || null, all_day: !evTime, is_done: false, color: null as null,
        notification_enabled: notifMin !== null,
        notification_minutes_before: notifMin ?? 0,
      };
      err = editingItem
        ? await updateEvent(editingItem.id, data)
        : await addEvent(data);
    }
    setSaving(false);
    if (err) {
      let msg = err.message ?? '不明なエラー';
      if (msg.includes('does not exist') || err.code === 'PGRST205')
        msg = 'テーブルが未作成です。Supabase SQL Editorで005_fix_idempotent.sqlを実行してください。';
      Alert.alert('保存できませんでした', msg);
    } else {
      setModalVisible(false);
    }
  }

  // 削除（モーダル内ボタン or 長押し）
  function confirmDelete(item: ScheduleItem) {
    Alert.alert('削除', `「${item.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: () => {
          if (item.source === 'shift') deleteShift(item.id);
          else deleteEvent(item.id);
          setModalVisible(false);
        },
      },
    ]);
  }

  // ── レンダリング ──────────────────────────────────────────
  const isEditing = !!editingItem;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.title}>予定</Text>
        <View style={styles.headerRight}>
          {/* AI分析ボタン */}
          <TouchableOpacity style={styles.aiBtn} onPress={openAI}>
            <Ionicons name="sparkles-outline" size={14} color={COLORS.primary} />
            <Text style={styles.aiBtnText}>AI分析</Text>
          </TouchableOpacity>

          {/* Googleカレンダー連携ボタン */}
          {IS_EXPO_GO ? (
            // Expo Go では機能しないため説明を表示
            <TouchableOpacity
              style={styles.gcalBtnDisabled}
              onPress={() =>
                Alert.alert(
                  'Googleカレンダー連携',
                  '📱 この機能は開発版アプリ（Dev Build）で利用できます。\n\nExpo Go では Google OAuth のリダイレクト制約があるため、現在は使用できません。',
                  [{ text: 'OK' }],
                )
              }
            >
              <Text style={styles.gcalBtnDisabledText}>G連携</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.gcalBtn, gcalConnected && styles.gcalBtnActive]}
              onPress={() => {
                if (gcalConnected) {
                  Alert.alert(
                    'Googleカレンダー',
                    'Googleアカウントとの連携を解除しますか？',
                    [
                      { text: 'キャンセル', style: 'cancel' },
                      { text: '連携解除', style: 'destructive', onPress: gcalSignOut },
                    ],
                  );
                } else {
                  // Premium 未加入の場合は、まず機能内容を案内してからペイウォールへ
                  if (!isPremium) {
                    Alert.alert(
                      'Googleカレンダー連携（Premium）',
                      'Googleカレンダー連携は Premium プランで今すぐご利用いただけます。\n\n連携すると、Googleカレンダーの予定をCamplyに表示できます（読み取り専用）。',
                      [
                        { text: '今はしない', style: 'cancel' },
                        { text: 'Premiumを見る', onPress: () => router.push('/paywall/premium' as never) },
                      ],
                    );
                    return;
                  }
                  gcalSignIn();
                }
              }}
              disabled={gcalLoading}
            >
              <Text style={[styles.gcalBtnText, gcalConnected && styles.gcalBtnTextActive]}>
                {gcalLoading ? '…' : gcalConnected ? 'G連携中' : 'G連携'}
              </Text>
            </TouchableOpacity>
          )}

          {/* 端末カレンダー連携ボタン */}
          <TouchableOpacity
            style={[styles.nativeCalBtn, nativeConnected && styles.nativeCalBtnActive]}
            onPress={() => {
              if (nativeConnected) {
                Alert.alert(
                  '端末カレンダー',
                  'iPhoneカレンダーとの連携を解除しますか？',
                  [
                    { text: 'キャンセル', style: 'cancel' },
                    { text: '連携解除', style: 'destructive', onPress: nativeDisconnect },
                  ],
                );
              } else {
                nativeConnect();
              }
            }}
            disabled={nativeLoading}
          >
            <Text style={[styles.nativeCalBtnText, nativeConnected && styles.nativeCalBtnTextActive]}>
              {nativeLoading ? '…' : nativeConnected ? '端末中' : '端末'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.addBtn} onPress={() => openAdd()}>
            <Text style={styles.addBtnText}>＋ 追加</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Googleカレンダー エラーバナー（Dev Build のみ表示） */}
      {!IS_EXPO_GO && gcalError && (
        <View style={styles.gcalErrorBar}>
          <Text style={styles.gcalErrorText}>⚠️ {gcalError}</Text>
          <TouchableOpacity onPress={gcalSignIn}>
            <Text style={styles.gcalErrorRetry}>再ログイン</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 端末カレンダー エラーバナー */}
      {nativeError && (
        <View style={styles.nativeCalErrorBar}>
          <Text style={styles.gcalErrorText}>⚠️ {nativeError}</Text>
          <TouchableOpacity onPress={nativeConnect}>
            <Text style={styles.gcalErrorRetry}>再試行</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* カレンダー */}
      <View style={styles.calendarWrap}>
        <MonthCalendar
          year={calYear} month={calMonth}
          selectedDate={selectedDate}
          onSelectDate={handleDateSelect}
          markers={calMarkers}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
        />
      </View>

      {/* 選択日バー / 全件表示バー */}
      <View style={styles.filterBar}>
        {selectedDate ? (
          <>
            <Text style={styles.filterBarDate}>{dateSectionLabel(selectedDate)}</Text>
            <TouchableOpacity style={styles.clearDateBtn} onPress={() => setSelectedDate(null)}>
              <Text style={styles.clearDateText}>全て表示</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.filterBarAll}>すべての予定 ({allItems.length}件)</Text>
            <TouchableOpacity style={styles.clearDateBtn} onPress={() => setSelectedDate(getToday())}>
              <Ionicons name="calendar-outline" size={13} color={COLORS.primary} />
              <Text style={styles.backToCalText}>今日に戻る</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* 予定リスト */}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {grouped.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>
              {selectedDate ? 'この日の予定はありません' : '予定はありません'}
            </Text>
            <TouchableOpacity style={styles.emptyAdd} onPress={() => openAdd()}>
              <Text style={styles.emptyAddText}>＋ 予定を追加</Text>
            </TouchableOpacity>
          </View>
        ) : (
          grouped.map(([date, dayItems]) => (
            <View key={date}>
              {/* 全件表示中のみ日付ヘッダーを表示 */}
              {!selectedDate && (
                <Text style={styles.dateHeader}>{dateSectionLabel(date)}</Text>
              )}
              {dayItems.map(item => {
                const isReadOnly = item.source === 'google' || item.source === 'native';
                const cfg = item.type === 'shift'
                  ? { icon: 'briefcase-outline',      label: 'バイト',         color: item.color, bg: '#ECFDF5', canComplete: false }
                  : item.source === 'google'
                  ? { icon: 'logo-google',             label: 'Gカレンダー',   color: GCAL_COLOR,  bg: '#EBF3FF', canComplete: false }
                  : item.source === 'native'
                  ? { icon: 'phone-portrait-outline',  label: '端末カレンダー', color: item.color,  bg: '#F0FDF4', canComplete: false }
                  : EVENT_CONFIG[item.type as EventType];
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemCard, { borderLeftColor: item.color }]}
                    onPress={() => openEdit(item)}
                    onLongPress={() => !isReadOnly && confirmDelete(item)}
                    activeOpacity={0.82}
                  >
                    {!isReadOnly && cfg.canComplete ? (
                      <TouchableOpacity
                        style={[styles.check, item.isDone && { backgroundColor: item.color, borderColor: item.color }]}
                        onPress={() => toggleDone(item.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {item.isDone && <Text style={styles.checkMark}>✓</Text>}
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name={cfg.icon as any} size={18} color={item.color} style={styles.itemIcon} />
                    )}
                    <View style={styles.itemBody}>
                      <Text style={[styles.itemTitle, item.isDone && styles.doneText]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View style={styles.itemMeta}>
                        {item.time && (
                          <Text style={styles.metaText}>
                            {item.time}{item.endTime ? ` 〜 ${item.endTime}` : ''}
                          </Text>
                        )}
                        {!item.time && isReadOnly && (
                          <Text style={styles.metaText}>終日</Text>
                        )}
                        {item.sub && <Text style={styles.metaText}>{item.sub}</Text>}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.typeBadgeText, { color: item.color }]}>{cfg.label}</Text>
                      </View>
                      <Text style={styles.editHint}>
                        {isReadOnly ? '読み取り専用' : 'タップで編集'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── 追加 / 編集モーダル ── */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

            {/* モーダルヘッダー */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancel}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {isEditing ? (shiftMode ? 'シフトを編集' : '予定を編集') : (shiftMode ? 'シフトを追加' : '予定を追加')}
              </Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[styles.modalSave, saving && { opacity: 0.4 }]}>
                  {saving ? '保存中...' : isEditing ? '更新' : '追加'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">

              {/* 種類（編集時は変更不可）*/}
              {!isEditing && (
                <>
                  <Text style={styles.formLabel}>種類</Text>
                  {TYPE_GROUPS.map(grp => (
                    <View key={grp.label} style={styles.typeBlock}>
                      <Text style={styles.typeGroupLabel}>{grp.label}</Text>
                      <View style={styles.typeRow}>
                        {grp.types.map(t => {
                          const isShift = t === 'shift';
                          const cfg     = isShift
                            ? { icon: 'briefcase-outline', label: 'バイト', color: '#10B981' }
                            : EVENT_CONFIG[t as EventType];
                          const active  = isShift ? shiftMode : (!shiftMode && evType === t);
                          return (
                            <TouchableOpacity key={String(t)}
                              style={[styles.typeBtn, active && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                              onPress={() => {
                                if (isShift) {
                                  setShiftMode(true);
                                  setShiftWorkplace(workplaces[0]?.id ?? '');
                                } else {
                                  setShiftMode(false);
                                  setEvType(t as EventType);
                                }
                              }}
                            >
                              <Text style={[styles.typeBtnText, active && { color: '#fff' }]}>
                                {cfg.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                  <View style={styles.divider} />
                </>
              )}

              {/* ── バイトフォーム ── */}
              {shiftMode && (
                <>
                  <Text style={styles.formLabel}>バイト先 *</Text>
                  {workplaces.length === 0 ? (
                    <View style={styles.warnBox}>
                      <Text style={styles.warnText}>⚠️ バイト先が未登録です。「お金」タブ →「給料」から登録してください。</Text>
                    </View>
                  ) : (
                    <View style={styles.wpRow}>
                      {workplaces.map(w => (
                        <TouchableOpacity key={w.id}
                          style={[styles.wpChip, shiftWorkplace === w.id && { backgroundColor: w.color, borderColor: w.color }]}
                          onPress={() => setShiftWorkplace(w.id)}
                        >
                          <Text style={[styles.wpChipText, shiftWorkplace === w.id && { color: '#fff' }]}>{w.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <InlineDatePicker label="日付 *" value={shiftDate} onChange={setShiftDate} />
                  <InlineTimePicker label="開始時刻 *" value={shiftStart} onChange={setShiftStart} />
                  <InlineTimePicker label="終了時刻 *" value={shiftEnd} onChange={setShiftEnd} />
                  <FormInput label="休憩（分）" value={shiftBreak} onChange={setShiftBreak} placeholder="60" keyboardType="number-pad" />
                  <NotifPicker value={notifMin} onChange={setNotifMin} />
                  {shiftStart && shiftEnd && shiftWorkplace && (
                    <View style={styles.wagePreview}>
                      <Text style={styles.wagePreviewText}>
                        給料見込み：¥{calcWage(
                          workplaces.find(w => w.id === shiftWorkplace)?.hourly_wage ?? 1000,
                          shiftStart, shiftEnd, parseInt(shiftBreak, 10) || 0,
                        ).toLocaleString()}
                      </Text>
                    </View>
                  )}
                </>
              )}

              {/* ── 通常イベントフォーム ── */}
              {!shiftMode && (
                <>
                  <FormInput label="タイトル *" value={evTitle} onChange={setEvTitle} placeholder="例：線形代数 レポート" />
                  <InlineDatePicker label="日付 *" value={evDate} onChange={setEvDate} />
                  <InlineTimePicker label="開始時刻（任意）" value={evTime} onChange={setEvTime} optional />
                  <InlineTimePicker label="終了時刻（任意）" value={evEndTime} onChange={setEvEndTime} optional />
                  <NotifPicker value={notifMin} onChange={setNotifMin} />
                  <FormInput label="メモ（任意）" value={evDesc} onChange={setEvDesc} placeholder="詳細・メモ" />
                </>
              )}

              {/* 編集時のみ削除ボタン */}
              {isEditing && editingItem && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => confirmDelete(editingItem)}
                >
                  <Text style={styles.deleteBtnText}>🗑 この予定を削除する</Text>
                </TouchableOpacity>
              )}

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── 端末カレンダー詳細モーダル ── */}
      <Modal
        visible={!!nativeDetailItem}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNativeDetailItem(null)}
      >
        {nativeDetailItem && (() => {
          const ev  = nativeDetailItem.raw as NativeCalEvent;
          const timeStr = nativeDetailItem.time
            ? `${nativeDetailItem.time}${nativeDetailItem.endTime ? ` 〜 ${nativeDetailItem.endTime}` : ''}`
            : '終日';
          return (
            <SafeAreaView style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <View style={{ width: 60 }} />
                <Text style={styles.modalTitle}>カレンダー詳細</Text>
                <TouchableOpacity onPress={() => setNativeDetailItem(null)}>
                  <Text style={styles.modalCancel}>閉じる</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
                {/* タイトル */}
                <View style={styles.nativeDetailBlock}>
                  <View style={[styles.nativeDetailBar, { backgroundColor: nativeDetailItem.color }]} />
                  <Text style={styles.nativeDetailTitle}>{nativeDetailItem.title}</Text>
                </View>
                {/* カレンダー名 */}
                <View style={styles.nativeDetailRow}>
                  <Text style={styles.nativeDetailLabel}>カレンダー</Text>
                  <Text style={styles.nativeDetailValue}>{ev.calendarTitle}</Text>
                </View>
                {/* 日付 */}
                <View style={styles.nativeDetailRow}>
                  <Text style={styles.nativeDetailLabel}>日時</Text>
                  <Text style={styles.nativeDetailValue}>
                    {fmtShort(nativeDetailItem.date)}{'  '}{timeStr}
                  </Text>
                </View>
                {/* メモ */}
                {ev.notes ? (
                  <View style={styles.nativeDetailRow}>
                    <Text style={styles.nativeDetailLabel}>メモ</Text>
                    <Text style={[styles.nativeDetailValue, { flex: 1 }]}>{ev.notes}</Text>
                  </View>
                ) : null}
                {/* 注記 */}
                <Text style={styles.nativeDetailNote}>
                  端末カレンダーのイベントは読み取り専用です。{'\n'}
                  編集はiPhoneのカレンダーアプリで行ってください。
                </Text>
              </ScrollView>
            </SafeAreaView>
          );
        })()}
      </Modal>

      {/* ── AI分析モーダル ── */}
      <Modal visible={aiModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{ width: 60 }} />
            <Text style={styles.modalTitle}>AI予定分析</Text>
            <TouchableOpacity onPress={() => { setAiModalVisible(false); clearAI(); }}>
              <Text style={styles.modalCancel}>閉じる</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {isAnalyzing && (
              <View style={styles.aiLoadingWrap}>
                <Text style={styles.aiLoadingText}>予定を分析中...</Text>
                <Text style={styles.aiLoadingNote}>Claude に聞いています</Text>
              </View>
            )}

            {!isAnalyzing && advice && (
              <View style={styles.aiResultWrap}>
                <View style={styles.aiResultHeader}>
                  <Text style={styles.aiResultLabel}>AIからのアドバイス</Text>
                  <TouchableOpacity
                    style={styles.aiRetryBtn}
                    onPress={openAI}
                  >
                    <Text style={styles.aiRetryText}>再分析</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.aiResultText}>{advice}</Text>
              </View>
            )}

            {!isAnalyzing && aiError && (
              <View style={styles.aiErrorWrap}>
                <Ionicons name="warning-outline" size={28} color={COLORS.danger} style={{ marginBottom: 8 }} />
                <Text style={styles.aiErrorText}>{aiError}</Text>
                <TouchableOpacity style={styles.aiRetryBtn} onPress={openAI}>
                  <Text style={styles.aiRetryText}>再試行</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isAnalyzing && !advice && !aiError && (
              <View style={styles.aiLoadingWrap}>
                <Text style={styles.aiLoadingText}>分析を開始します...</Text>
              </View>
            )}

            <View style={styles.aiNote}>
              <Text style={styles.aiNoteText}>
                分析対象: アプリ内の予定（Googleカレンダーを除く）
              </Text>
              <Text style={styles.aiNoteText}>
                Powered by Anthropic Claude
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

// ── 通知タイミング選択 ────────────────────────────────────────────
const NOTIF_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: '通知なし' },
  { value: 0,    label: '時刻通り' },
  { value: 5,    label: '5分前' },
  { value: 10,   label: '10分前' },
  { value: 15,   label: '15分前' },
  { value: 30,   label: '30分前' },
  { value: 60,   label: '1時間前' },
  { value: 1440, label: '1日前' },
];

function NotifPicker({ value, onChange }: {
  value: number | null; onChange: (v: number | null) => void;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.formLabel}>通知</Text>
      <View style={styles.notifRow}>
        {NOTIF_OPTIONS.map(opt => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[styles.notifChip, selected && styles.notifChipOn]}
              onPress={() => onChange(opt.value)}
            >
              <Text style={[styles.notifChipText, selected && styles.notifChipTextOn]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── 汎用フォーム入力 ──────────────────────────────────────────────
function FormInput({ label, value, onChange, placeholder, keyboardType }: {
  label: string; value: string; onChange: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'numbers-and-punctuation' | 'number-pad';
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput style={styles.formInput} value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor={COLORS.gray400}
        keyboardType={keyboardType ?? 'default'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },

  // ヘッダー
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.xs },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title:        { fontSize: 22, fontWeight: '800', color: COLORS.gray900 },
  addBtn:       { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm + 2, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },

  // AI ボタン
  aiBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.sm + 2, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#EDE9FE', borderWidth: 1.5, borderColor: '#8B5CF6' },
  aiBtnText: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },

  // Googleカレンダーボタン
  gcalBtn:            { borderRadius: RADIUS.sm + 2, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  gcalBtnActive:      { borderColor: GCAL_COLOR, backgroundColor: '#EBF3FF' },
  gcalBtnText:        { fontSize: 12, fontWeight: '700', color: COLORS.gray600 },
  gcalBtnTextActive:  { color: GCAL_COLOR },
  gcalBtnDisabled:    { borderRadius: RADIUS.sm + 2, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.gray50 },
  gcalBtnDisabledText:{ fontSize: 12, fontWeight: '600', color: COLORS.gray400 },

  // 端末カレンダーボタン
  nativeCalBtn:          { borderRadius: RADIUS.sm + 2, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  nativeCalBtnActive:    { borderColor: NATIVE_COLOR, backgroundColor: '#F0FDF4' },
  nativeCalBtnText:      { fontSize: 12, fontWeight: '700', color: COLORS.gray600 },
  nativeCalBtnTextActive:{ color: NATIVE_COLOR },

  // Googleカレンダー エラーバー
  gcalErrorBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FEF3C7' },
  gcalErrorText:   { fontSize: 12, color: '#92400E', flex: 1 },
  gcalErrorRetry:  { fontSize: 12, fontWeight: '700', color: COLORS.primary, paddingLeft: 8 },
  nativeCalErrorBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#DCFCE7' },

  // AI モーダル
  aiLoadingWrap:  { alignItems: 'center', paddingVertical: 48 },
  aiLoadingEmoji: { fontSize: 44, marginBottom: 16 },
  aiLoadingText:  { fontSize: 16, fontWeight: '700', color: COLORS.gray900, marginBottom: 6 },
  aiLoadingNote:  { fontSize: 13, color: COLORS.gray400 },

  aiResultWrap:   { backgroundColor: '#F5F3FF', borderRadius: RADIUS.lg, padding: 18, marginBottom: 20 },
  aiResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  aiResultLabel:  { fontSize: 14, fontWeight: '800', color: '#7C3AED' },
  aiResultText:   { fontSize: 15, color: COLORS.gray900, lineHeight: 24 },

  aiRetryBtn:  { backgroundColor: '#EDE9FE', borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 6 },
  aiRetryText: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },

  aiErrorWrap:  { alignItems: 'center', paddingVertical: 32, gap: 12 },
  aiErrorEmoji: { fontSize: 36 },
  aiErrorText:  { fontSize: 13, color: COLORS.gray600, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },

  aiNote:     { marginTop: 16, gap: 4 },
  aiNoteText: { fontSize: 12, color: COLORS.gray400, textAlign: 'center' },

  // カレンダー
  calendarWrap: { backgroundColor: COLORS.white, marginHorizontal: 0, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },

  // 選択日バー
  filterBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray200,
  },
  filterBarDate: { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  filterBarAll:  { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  clearDateBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.primary },
  clearDateText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  backToCalText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  // リスト
  list:       { flex: 1 },
  dateHeader: { fontSize: 13, fontWeight: '700', color: COLORS.gray700, paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xs },

  // アイテムカード
  itemCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md, marginBottom: SPACING.xs + 2,
    borderRadius: RADIUS.lg, padding: 14,
    borderLeftWidth: 3, gap: 10,
    ...SHADOW.sm,
  },
  check:     { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 12, color: '#fff', fontWeight: '800' },
  itemIcon:  { width: 26, textAlign: 'center' },
  itemBody:  { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray900, lineHeight: 21 },
  itemMeta:  { flexDirection: 'row', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  metaText:  { fontSize: 14, color: COLORS.gray400 },
  doneText:  { textDecorationLine: 'line-through', color: COLORS.gray400 },
  typeBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  editHint:      { fontSize: 10, color: COLORS.gray200 },

  // 空状態
  emptyWrap:    { alignItems: 'center', paddingTop: 40 },
  emptyEmoji:   { fontSize: 44, marginBottom: 12 },
  emptyText:    { fontSize: 14, color: COLORS.gray400, marginBottom: 20 },
  emptyAdd:     { backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, paddingHorizontal: 20, paddingVertical: 10 },
  emptyAddText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },

  // モーダル
  modalContainer: { flex: 1, backgroundColor: COLORS.white },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  modalTitle:     { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  modalCancel:    { fontSize: 15, color: COLORS.gray600 },
  modalSave:      { fontSize: 15, fontWeight: '700', color: COLORS.primary },

  // 種類選択
  typeBlock:      { marginBottom: 10 },
  typeGroupLabel: { fontSize: 11, fontWeight: '800', color: COLORS.gray500, marginBottom: 6 },
  typeRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  typeBtn:        { paddingHorizontal: 12, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm + 2, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  typeBtnText:    { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  divider:        { height: 1, backgroundColor: COLORS.gray100, marginVertical: SPACING.md },

  // フォーム
  formLabel: { fontSize: 13, fontWeight: '700', color: COLORS.gray600, marginBottom: 6 },

  // 通知タイミングチップ
  notifRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notifChip: {
    borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: COLORS.white,
  },
  notifChipOn:      { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  notifChipText:    { fontSize: 13, fontWeight: '600', color: COLORS.gray500 },
  notifChipTextOn:  { color: COLORS.primary, fontWeight: '700' },
  formInput: { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: RADIUS.sm + 2, padding: 12, fontSize: 14, color: COLORS.gray900, backgroundColor: COLORS.gray50 },

  // 端末カレンダー詳細モーダル
  nativeDetailBlock: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nativeDetailBar:   { width: 4, height: 40, borderRadius: 2 },
  nativeDetailTitle: { fontSize: 20, fontWeight: '800', color: COLORS.gray900, flex: 1 },
  nativeDetailRow:   { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  nativeDetailLabel: { fontSize: 13, color: COLORS.gray400, width: 80 },
  nativeDetailValue: { fontSize: 14, color: COLORS.gray900, fontWeight: '500' },
  nativeDetailNote:  { fontSize: 13, color: COLORS.gray400, textAlign: 'center', lineHeight: 20, marginTop: 24 },

  // バイト先
  wpRow:      { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap', marginBottom: 14 },
  wpChip:     { paddingHorizontal: 12, paddingVertical: SPACING.sm, borderRadius: RADIUS.sm + 2, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  wpChipText: { fontSize: 13, fontWeight: '600', color: COLORS.gray900 },

  // 給与プレビュー
  wagePreview:     { backgroundColor: COLORS.successLight, borderRadius: RADIUS.sm + 2, padding: 12, marginBottom: 14 },
  wagePreviewText: { fontSize: 14, fontWeight: '700', color: COLORS.success, textAlign: 'center' },

  // 警告
  warnBox:  { backgroundColor: COLORS.warningLight, borderRadius: RADIUS.sm + 2, padding: 12, marginBottom: 14 },
  warnText: { fontSize: 13, color: COLORS.warning, lineHeight: 18 },

  // 削除ボタン
  deleteBtn:     { marginTop: SPACING.lg, marginBottom: SPACING.sm, padding: 14, borderRadius: RADIUS.md, backgroundColor: '#FEF2F2', alignItems: 'center' },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.danger },
});
