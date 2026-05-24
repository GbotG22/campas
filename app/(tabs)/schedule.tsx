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
import { useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';
import InlineDatePicker from '@/components/InlineDatePicker';
import InlineTimePicker from '@/components/InlineTimePicker';
import MonthCalendar, { CalendarMarker } from '@/components/MonthCalendar';
import { useEvents, EVENT_CONFIG, AppEvent } from '@/hooks/useEvents';
import { useShifts, ShiftWithWorkplace, calcWage } from '@/hooks/useShifts';
import { useWorkplaces } from '@/hooks/useWorkplaces';
import {
  useGoogleCalendar, GCalEvent,
  gCalEventDate, gCalEventTime, gCalEventEndTime,
} from '@/hooks/useGoogleCalendar';
import type { EventType } from '@/types/database';

const TODAY    = new Date().toISOString().split('T')[0];
const TOMORROW = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();

/** Googleカレンダーイベントの表示色 */
const GCAL_COLOR = '#4285F4'; // Google ブルー

// ── AI対応統一アイテム型 ────────────────────────────────────────────
interface ScheduleItem {
  id:          string;
  type:        EventType | 'shift' | 'google';
  title:       string;
  date:        string;          // YYYY-MM-DD
  time:        string | null;   // HH:MM
  endTime:     string | null;   // HH:MM
  description: string | null;   // AI入力・ユーザーメモ
  isDone:      boolean;
  color:       string;
  sub:         string | null;   // 補足テキスト（給与見込みなど）
  source:      'event' | 'shift' | 'google';
  raw:         AppEvent | ShiftWithWorkplace | GCalEvent;
}

// 種類グループ（追加モーダルの表示用）
const TYPE_GROUPS: { label: string; types: (EventType | 'shift')[] }[] = [
  { label: '学校', types: ['assignment','test','report','school_event','class_cancel','class_makeup'] },
  { label: 'バイト', types: ['shift'] },
  { label: 'プライベート', types: ['personal','circle','other'] },
];

// 日付ラベル
function dateSectionLabel(date: string): string {
  if (date === TODAY)    return `今日 · ${fmtShort(date)}`;
  if (date === TOMORROW) return `明日 · ${fmtShort(date)}`;
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
    refresh: gcalRefresh, request: gcalRequest,
  } = useGoogleCalendar();

  // ── カレンダー ─────────────────────────────────────────────
  const todayDate = new Date();
  const [calYear,  setCalYear]  = useState(todayDate.getFullYear());
  const [calMonth, setCalMonth] = useState(todayDate.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(TODAY);

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
    gCalEvents.forEach(ev => {
      const date = gCalEventDate(ev);
      if (!date) return;
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

    return result.sort((a, b) =>
      a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''),
    );
  }, [events, shifts, gCalEvents]);

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
  const [evDate,         setEvDate]         = useState(TODAY);
  const [evTime,         setEvTime]         = useState('');
  const [evEndTime,      setEvEndTime]      = useState('');
  const [evDesc,         setEvDesc]         = useState('');
  const [shiftWorkplace, setShiftWorkplace] = useState('');
  const [shiftDate,      setShiftDate]      = useState(TODAY);
  const [shiftStart,     setShiftStart]     = useState('');
  const [shiftEnd,       setShiftEnd]       = useState('');
  const [shiftBreak,     setShiftBreak]     = useState('0');

  // 追加モードで開く（選択日を自動セット）
  function openAdd(type: EventType | 'shift' = 'assignment') {
    setEditingItem(null);
    const date = selectedDate ?? TODAY;
    if (type === 'shift') {
      setShiftMode(true);
      setShiftWorkplace(workplaces[0]?.id ?? '');
      setShiftDate(date); setShiftStart(''); setShiftEnd(''); setShiftBreak('0');
    } else {
      setShiftMode(false); setEvType(type);
      setEvTitle(''); setEvDate(date); setEvTime(''); setEvEndTime(''); setEvDesc('');
    }
    setModalVisible(true);
  }

  // 編集モードで開く（Googleイベントは読み取り専用）
  function openEdit(item: ScheduleItem) {
    if (item.source === 'google') {
      // 読み取り専用の詳細表示
      const ev = item.raw as GCalEvent;
      const timeStr = item.time
        ? `${item.time}${item.endTime ? ` 〜 ${item.endTime}` : ''}`
        : '終日';
      const lines = [timeStr];
      if (item.description) lines.push(item.description);
      lines.push('\nGoogleカレンダーのイベントは編集できません。');
      Alert.alert(item.title, lines.join('\n'), [{ text: '閉じる' }]);
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
    } else {
      const e = item.raw as AppEvent;
      setShiftMode(false);
      setEvType(e.event_type);
      setEvTitle(e.title);
      setEvDate(e.start_date);
      setEvTime(e.start_time ?? '');
      setEvEndTime(e.end_time ?? '');
      setEvDesc(e.description ?? '');
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
      const wp = workplaces.find(w => w.id === shiftWorkplace);
      const data = {
        workplace_id: shiftWorkplace, date: shiftDate,
        start_time: shiftStart, end_time: shiftEnd,
        break_minutes: parseInt(shiftBreak, 10) || 0, note: null as null,
      };
      err = editingItem
        ? await updateShift(editingItem.id, data, wp?.hourly_wage)
        : await addShift(data, wp?.hourly_wage ?? 1000);
    } else {
      if (!evTitle.trim()) {
        Alert.alert('入力エラー', 'タイトルを入力してください');
        setSaving(false); return;
      }
      const data = {
        event_type: evType, title: evTitle.trim(), start_date: evDate,
        start_time: evTime || null, end_time: evEndTime || null,
        description: evDesc.trim() || null, all_day: !evTime, is_done: false, color: null as null,
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
          {/* Googleカレンダー連携ボタン */}
          <TouchableOpacity
            style={[styles.gcalBtn, gcalConnected && styles.gcalBtnActive]}
            onPress={() => {
              if (gcalConnected) {
                // 接続中 → 解除確認
                Alert.alert(
                  'Googleカレンダー',
                  'Googleアカウントとの連携を解除しますか？',
                  [
                    { text: 'キャンセル', style: 'cancel' },
                    { text: '連携解除', style: 'destructive', onPress: gcalSignOut },
                  ],
                );
              } else {
                // 未接続 → クライアントID チェック（webClientId が最低限必要）
                if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
                  Alert.alert(
                    '設定が必要です',
                    '.env.local に EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID を設定してください。\n\nGoogle Cloud Console でウェブ OAuth クライアント ID を作成し、承認済みリダイレクト URI に以下を追加してください：\nhttps://auth.expo.io/@あなたのExpoユーザー名/campas',
                  );
                  return;
                }
                // iOS でも webClientId フォールバックで動作するためここでは弾かない
                gcalSignIn();
              }
            }}
            disabled={gcalLoading}
          >
            <Text style={[styles.gcalBtnText, gcalConnected && styles.gcalBtnTextActive]}>
              {gcalLoading ? '…' : gcalConnected ? '🔵 G連携中' : '⬜ G連携'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.addBtn} onPress={() => openAdd()}>
            <Text style={styles.addBtnText}>＋ 追加</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Googleカレンダー エラーバナー */}
      {gcalError && (
        <View style={styles.gcalErrorBar}>
          <Text style={styles.gcalErrorText}>⚠️ {gcalError}</Text>
          <TouchableOpacity onPress={gcalSignIn}>
            <Text style={styles.gcalErrorRetry}>再ログイン</Text>
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
              <Text style={styles.clearDateText}>× 全て表示</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.filterBarAll}>すべての予定 ({allItems.length}件)</Text>
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
                const isGoogle = item.source === 'google';
                const cfg = item.type === 'shift'
                  ? { emoji: '💼', label: 'バイト',         color: item.color, bg: '#ECFDF5', canComplete: false }
                  : isGoogle
                  ? { emoji: '📅', label: 'Gカレンダー',   color: GCAL_COLOR,  bg: '#EBF3FF', canComplete: false }
                  : EVENT_CONFIG[item.type as EventType];
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemCard, { borderLeftColor: item.color }]}
                    onPress={() => openEdit(item)}
                    onLongPress={() => !isGoogle && confirmDelete(item)}
                    activeOpacity={0.82}
                  >
                    {!isGoogle && cfg.canComplete ? (
                      <TouchableOpacity
                        style={[styles.check, item.isDone && { backgroundColor: item.color, borderColor: item.color }]}
                        onPress={() => toggleDone(item.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {item.isDone && <Text style={styles.checkMark}>✓</Text>}
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.emoji}>{cfg.emoji}</Text>
                    )}
                    <View style={styles.itemBody}>
                      <Text style={[styles.itemTitle, item.isDone && styles.doneText]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View style={styles.itemMeta}>
                        {item.time && (
                          <Text style={styles.metaText}>
                            🕐 {item.time}{item.endTime ? ` 〜 ${item.endTime}` : ''}
                          </Text>
                        )}
                        {!item.time && isGoogle && (
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
                        {isGoogle ? '読み取り専用' : 'タップで編集'}
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
                            ? { emoji: '💼', label: 'バイト', color: '#10B981' }
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
                                {cfg.emoji} {cfg.label}
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
                  {shiftStart && shiftEnd && shiftWorkplace && (
                    <View style={styles.wagePreview}>
                      <Text style={styles.wagePreviewText}>
                        💰 給料見込み：¥{calcWage(
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

    </SafeAreaView>
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
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:        { fontSize: 22, fontWeight: '800', color: COLORS.gray900 },
  addBtn:       { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Googleカレンダーボタン
  gcalBtn:         { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  gcalBtnActive:   { borderColor: GCAL_COLOR, backgroundColor: '#EBF3FF' },
  gcalBtnText:     { fontSize: 12, fontWeight: '700', color: COLORS.gray600 },
  gcalBtnTextActive: { color: GCAL_COLOR },

  // Googleカレンダー エラーバー
  gcalErrorBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FEF3C7' },
  gcalErrorText:  { fontSize: 12, color: '#92400E', flex: 1 },
  gcalErrorRetry: { fontSize: 12, fontWeight: '700', color: COLORS.primary, paddingLeft: 8 },

  // カレンダー
  calendarWrap: { backgroundColor: COLORS.white, marginHorizontal: 0, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },

  // 選択日バー
  filterBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.primaryLight, borderBottomWidth: 1, borderBottomColor: COLORS.primary + '30',
  },
  filterBarDate: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  filterBarAll:  { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  clearDateBtn:  { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: COLORS.white, borderRadius: 8, borderWidth: 1, borderColor: COLORS.primary },
  clearDateText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  // リスト
  list:       { flex: 1 },
  dateHeader: { fontSize: 12, fontWeight: '800', color: COLORS.gray400, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, letterSpacing: 0.3 },

  // アイテムカード
  itemCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 12, marginBottom: 6,
    borderRadius: 14, padding: 14,
    borderLeftWidth: 4, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  check:     { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 12, color: '#fff', fontWeight: '800' },
  emoji:     { fontSize: 20, width: 26, textAlign: 'center' },
  itemBody:  { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: COLORS.gray900, lineHeight: 20 },
  itemMeta:  { flexDirection: 'row', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  metaText:  { fontSize: 12, color: COLORS.gray400 },
  doneText:  { textDecorationLine: 'line-through', color: COLORS.gray400 },
  typeBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  editHint:      { fontSize: 10, color: COLORS.gray200 },

  // 空状態
  emptyWrap:    { alignItems: 'center', paddingTop: 40 },
  emptyEmoji:   { fontSize: 44, marginBottom: 12 },
  emptyText:    { fontSize: 14, color: COLORS.gray400, marginBottom: 20 },
  emptyAdd:     { backgroundColor: COLORS.primaryLight, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  emptyAddText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },

  // モーダル
  modalContainer: { flex: 1, backgroundColor: COLORS.white },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  modalTitle:     { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  modalCancel:    { fontSize: 15, color: COLORS.gray600 },
  modalSave:      { fontSize: 15, fontWeight: '700', color: COLORS.primary },

  // 種類選択
  typeBlock:      { marginBottom: 10 },
  typeGroupLabel: { fontSize: 11, fontWeight: '800', color: COLORS.gray400, letterSpacing: 0.5, marginBottom: 6 },
  typeRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn:        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  typeBtnText:    { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  divider:        { height: 1, backgroundColor: COLORS.gray100, marginVertical: 16 },

  // フォーム
  formLabel: { fontSize: 13, fontWeight: '700', color: COLORS.gray600, marginBottom: 6 },
  formInput: { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.gray900, backgroundColor: COLORS.gray50 },

  // バイト先
  wpRow:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  wpChip:     { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  wpChipText: { fontSize: 13, fontWeight: '600', color: COLORS.gray900 },

  // 給与プレビュー
  wagePreview:     { backgroundColor: COLORS.successLight, borderRadius: 10, padding: 12, marginBottom: 14 },
  wagePreviewText: { fontSize: 14, fontWeight: '700', color: COLORS.success, textAlign: 'center' },

  // 警告
  warnBox:  { backgroundColor: COLORS.warningLight, borderRadius: 10, padding: 12, marginBottom: 14 },
  warnText: { fontSize: 13, color: COLORS.warning, lineHeight: 18 },

  // 削除ボタン
  deleteBtn:     { marginTop: 24, marginBottom: 8, padding: 14, borderRadius: 12, backgroundColor: '#FEF2F2', alignItems: 'center' },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
});
