import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated,
  KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import InlineDatePicker from '@/components/InlineDatePicker';
import { COLORS, DAY_LABELS, SUBJECT_COLORS } from '@/constants/theme';
import { ATT_CONFIG, useAttendance, AttendanceStatus } from '@/hooks/useAttendance';
import { EVENT_CONFIG, useClassEvents, EventType }    from '@/hooks/useClassEvents';
import { useClassMemo }                               from '@/hooks/useClassMemos';
import { useClassSchedules }                          from '@/hooks/useClassSchedules';
import { usePeriodSettings }                          from '@/hooks/usePeriodSettings';
import { useAuthStore }                               from '@/stores/auth.store';
import { supabase }                                   from '@/lib/supabase';
import { cancelClassNotification, scheduleClassNotification } from '@/lib/notifications';
import { getDetailedNotificationSettings } from '@/lib/notificationSettings';
import { localYMD }                                   from '@/lib/dateUtils';
import type { Database }                              from '@/types/database';

type Slot = Database['public']['Tables']['timetable_slots']['Row'];

function getToday() { return localYMD(new Date()); }


export default function SlotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { config } = usePeriodSettings();

  // ── スロット情報 ────────────────────────────────────────────
  const [slot,        setSlot]        = useState<Slot | null>(null);
  const [loadingSlot, setLoadingSlot] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase.from('timetable_slots').select('*').eq('id', id).single()
      .then(({ data }) => { setSlot(data); setLoadingSlot(false); });
  }, [id]);

  // ── データフック ────────────────────────────────────────────
  const { records, getStats, getRecordsForSlot, record, deleteRecord } = useAttendance();
  const { events, isLoading: eventsLoading, addEvent, deleteEvent } = useClassEvents(id);
  const { content: memoContent, setContent: setMemoContent, save: saveMemo, isSaving: memoSaving } = useClassMemo(id ?? '');
  const { schedules, addSchedule, deleteSchedule, nextSessionNumber } = useClassSchedules(id ?? '');

  const slotRecords = id ? getRecordsForSlot(id) : [];
  const stats = id ? getStats(id, config.requiredRate) : null;

  // ── 編集モーダル（科目基本情報） ──────────────────────────
  const [editVisible,  setEditVisible]  = useState(false);
  const [editName,     setEditName]     = useState('');
  const [editRoom,     setEditRoom]     = useState('');
  const [editTeacher,  setEditTeacher]  = useState('');
  const [editColor,    setEditColor]    = useState<string>(COLORS.primary);
  const [editSaving,   setEditSaving]   = useState(false);

  function openEdit() {
    if (!slot) return;
    setEditName(slot.subject_name);
    setEditRoom(slot.room ?? '');
    setEditTeacher(slot.teacher_name ?? '');
    setEditColor(slot.color ?? COLORS.primary);
    setEditVisible(true);
  }

  async function handleEditSave() {
    if (!slot || !editName.trim()) return;
    setEditSaving(true);
    const { data, error } = await supabase
      .from('timetable_slots')
      .update({
        subject_name: editName.trim(),
        room:         editRoom.trim() || null,
        teacher_name: editTeacher.trim() || null,
        color:        editColor,
      })
      .eq('id', slot.id)
      .select()
      .single();
    setEditSaving(false);
    if (!error && data) {
      setSlot(data);
      setEditVisible(false);
      getDetailedNotificationSettings().then(s => {
        scheduleClassNotification(data, config, s.classMinutes).catch(() => {});
      }).catch(() => {});
    } else Alert.alert('エラー', '更新できませんでした');
  }

  function handleDelete() {
    Alert.alert('削除確認', `「${slot?.subject_name}」を削除しますか？この操作は元に戻せません。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('timetable_slots').delete().eq('id', slot!.id);
          cancelClassNotification(slot!.id).catch(() => {});
          router.back();
        },
      },
    ]);
  }

  // ── 出席追加モーダル ────────────────────────────────────────
  const [attVisible,   setAttVisible]   = useState(false);
  const [attDate,      setAttDate]      = useState(getToday());
  const [attStatus,    setAttStatus]    = useState<AttendanceStatus>('present');
  const [attNote,      setAttNote]      = useState('');
  const [attSaving,    setAttSaving]    = useState(false);
  const [showAllAtt,   setShowAllAtt]   = useState(false);

  async function handleAttSave() {
    if (!id || !attDate) {
      Alert.alert('エラー', '日付を選択してください');
      return;
    }
    setAttSaving(true);
    await record(id, attDate, attStatus, attNote.trim() || undefined);
    setAttSaving(false);
    setAttVisible(false);
    setAttNote('');
  }

  // ── イベント追加モーダル ────────────────────────────────────
  const [evtVisible,  setEvtVisible]  = useState(false);
  const [evtDate,     setEvtDate]     = useState(getToday());
  const [evtType,     setEvtType]     = useState<EventType>('cancel');
  const [evtTitle,    setEvtTitle]    = useState('');
  const [evtNote,     setEvtNote]     = useState('');
  const [evtSaving,   setEvtSaving]   = useState(false);

  async function handleEvtSave() {
    if (!evtDate || !evtTitle.trim()) {
      Alert.alert('エラー', '日付とタイトルを入力してください');
      return;
    }
    setEvtSaving(true);
    await addEvent({ date: evtDate, event_type: evtType, title: evtTitle.trim(), note: evtNote.trim() || null });
    setEvtSaving(false);
    setEvtVisible(false);
    setEvtTitle(''); setEvtNote('');
  }

  // ── スケジュール追加モーダル ────────────────────────────────
  const [schVisible,  setSchVisible]  = useState(false);
  const [schNum,      setSchNum]      = useState(1);
  const [schTitle,    setSchTitle]    = useState('');
  const [schDate,     setSchDate]     = useState('');
  const [schDesc,     setSchDesc]     = useState('');
  const [schSaving,   setSchSaving]   = useState(false);

  function openSchModal() {
    setSchNum(nextSessionNumber());
    setSchTitle(''); setSchDate(''); setSchDesc('');
    setSchVisible(true);
  }

  async function handleSchSave() {
    if (!schTitle.trim()) { Alert.alert('エラー', 'タイトルを入力してください'); return; }
    setSchSaving(true);
    await addSchedule({
      session_number: schNum,
      title:          schTitle.trim(),
      date:           schDate || null,
      description:    schDesc.trim() || null,
    });
    setSchSaving(false);
    setSchVisible(false);
  }

  // ── メモ自動保存 ────────────────────────────────────────────
  const memoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleMemoChange(text: string) {
    setMemoContent(text);
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(() => saveMemo(text), 1200);
  }

  // ── ローディング ────────────────────────────────────────────
  if (loadingSlot || !slot) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const slotColor = slot.color ?? COLORS.primary;
  const dayLabel  = DAY_LABELS[slot.day_of_week];
  const periodPt  = config.periods.find(p => p.period === slot.period);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── ヘッダー ── */}
      <View style={[styles.header, { backgroundColor: slotColor + '22' }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ 戻る</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerSubject, { color: slotColor }]} numberOfLines={1}>{slot.subject_name}</Text>
          <Text style={styles.headerMeta}>
            {dayLabel}曜 {slot.period}限
            {periodPt ? ` · ${periodPt.start}〜${periodPt.end}` : ''}
          </Text>
          {slot.room         && <Text style={styles.headerInfo}>📍 {slot.room}</Text>}
          {slot.teacher_name && <Text style={styles.headerInfo}>👤 {slot.teacher_name}</Text>}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={openEdit} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>編集</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, { color: COLORS.danger }]}>削除</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* ── 出欠管理 ── */}
        <Section title="出欠管理" action={{ label: '＋ 記録', onPress: () => { setAttDate(getToday()); setAttStatus('present'); setAttVisible(true); } }}>

          {/* 統計カード */}
          {stats && stats.total > 0 && (
            <>
              <View style={styles.statsCard}>
                <StatItem label="出席率" value={`${stats.rate ?? '—'}%`} color={stats.isWarning ? COLORS.danger : COLORS.success} />
                <StatItem label="あと休める" value={`${stats.canSkip}回`} color={stats.canSkip === 0 ? COLORS.danger : COLORS.gray900} />
                <StatItem label="記録数" value={`${stats.total}回`} color={COLORS.gray600} />
              </View>

              {/* プログレスバー */}
              <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, {
                    width: `${Math.min(100, stats.rate ?? 0)}%` as `${number}%`,
                    backgroundColor: stats.isWarning ? COLORS.danger : COLORS.success,
                  }]} />
                </View>
                {/* 基準ライン */}
                <View style={[styles.progressLine, { left: `${config.requiredRate}%` as `${number}%` }]}>
                  <Text style={styles.progressLineLabel}>{config.requiredRate}%</Text>
                </View>
              </View>

              {/* 内訳 */}
              <View style={styles.attBreakdown}>
                {(['present','late','early_leave','absent'] as AttendanceStatus[]).map(s => {
                  const cnt = slotRecords.filter(r => r.status === s).length;
                  if (cnt === 0) return null;
                  return (
                    <View key={s} style={[styles.breakdownChip, { backgroundColor: ATT_CONFIG[s].bg }]}>
                      <Text style={[styles.breakdownText, { color: ATT_CONFIG[s].color }]}>
                        {ATT_CONFIG[s].label} {cnt}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
          {stats && stats.total === 0 && (
            <Text style={styles.emptyHint}>出席を記録すると統計が表示されます</Text>
          )}

          {/* 記録一覧 */}
          {slotRecords.slice(0, showAllAtt ? undefined : 5).map(r => (
            <View key={r.id} style={styles.recordRow}>
              <Text style={styles.recordDate}>{r.date}</Text>
              <View style={[styles.recordBadge, { backgroundColor: ATT_CONFIG[r.status as AttendanceStatus].bg }]}>
                <Text style={[styles.recordStatus, { color: ATT_CONFIG[r.status as AttendanceStatus].color }]}>
                  {ATT_CONFIG[r.status as AttendanceStatus].label}
                </Text>
              </View>
              {r.note && <Text style={styles.recordNote} numberOfLines={1}>{r.note}</Text>}
              <TouchableOpacity
                style={styles.deleteRowBtn}
                onPress={() => Alert.alert('削除', 'この記録を削除しますか？', [
                  { text: 'キャンセル', style: 'cancel' },
                  { text: '削除', style: 'destructive', onPress: () => deleteRecord(r.slot_id, r.date) },
                ])}
              >
                <Text style={styles.deleteRowText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {slotRecords.length > 5 && (
            <TouchableOpacity onPress={() => setShowAllAtt(v => !v)} style={styles.showMoreBtn}>
              <Text style={styles.showMoreText}>{showAllAtt ? '▲ 折りたたむ' : `▼ 全${slotRecords.length}件を見る`}</Text>
            </TouchableOpacity>
          )}
        </Section>

        {/* ── 休講・補講 ── */}
        <Section title="休講・補講" action={{ label: '＋ 追加', onPress: () => { setEvtDate(getToday()); setEvtType('cancel'); setEvtTitle(''); setEvtNote(''); setEvtVisible(true); } }}>
          {eventsLoading && <ActivityIndicator color={COLORS.primary} />}
          {!eventsLoading && events.length === 0 && (
            <Text style={styles.emptyHint}>休講・補講・テスト等を登録できます</Text>
          )}
          {events.map(e => {
            const cfg = EVENT_CONFIG[e.event_type];
            return (
              <View key={e.id} style={styles.eventRow}>
                <View style={[styles.eventTypeBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.eventTypeText, { color: cfg.color }]}>{cfg.emoji} {cfg.label}</Text>
                </View>
                <View style={styles.eventContent}>
                  <Text style={styles.eventDate}>{e.date}</Text>
                  <Text style={styles.eventTitle}>{e.title}</Text>
                  {e.note && <Text style={styles.eventNote}>{e.note}</Text>}
                </View>
                <TouchableOpacity
                  onPress={() => Alert.alert('削除', `「${e.title}」を削除しますか？`, [
                    { text: 'キャンセル', style: 'cancel' },
                    { text: '削除', style: 'destructive', onPress: () => deleteEvent(e.id) },
                  ])}
                >
                  <Text style={styles.deleteRowText}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </Section>

        {/* ── 授業スケジュール ── */}
        <Section title="授業スケジュール" action={{ label: '＋ 追加', onPress: openSchModal }}>
          {schedules.length === 0 && (
            <Text style={styles.emptyHint}>第1回・第2回…と授業内容を記録できます</Text>
          )}
          {schedules.map(s => (
            <View key={s.id} style={styles.scheduleRow}>
              <View style={[styles.scheduleNum, { backgroundColor: slotColor + '22' }]}>
                <Text style={[styles.scheduleNumText, { color: slotColor }]}>{s.session_number}</Text>
              </View>
              <View style={styles.scheduleContent}>
                <Text style={styles.scheduleTitle}>{s.title}</Text>
                {s.date        && <Text style={styles.scheduleMeta}>📅 {s.date}</Text>}
                {s.description && <Text style={styles.scheduleMeta}>{s.description}</Text>}
              </View>
              <TouchableOpacity
                onPress={() => Alert.alert('削除', `第${s.session_number}回を削除しますか？`, [
                  { text: 'キャンセル', style: 'cancel' },
                  { text: '削除', style: 'destructive', onPress: () => deleteSchedule(s.id) },
                ])}
              >
                <Text style={styles.deleteRowText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </Section>

        {/* ── メモ ── */}
        <Section title="メモ" subtitle={memoSaving ? '保存中...' : '自動保存'}>
          <TextInput
            style={styles.memoInput}
            multiline
            value={memoContent}
            onChangeText={handleMemoChange}
            placeholder={'教科書・評価方法・Zoomリンク・持ち物など自由にメモ'}
            placeholderTextColor={COLORS.gray400}
            textAlignVertical="top"
          />
        </Section>

      </ScrollView>

      {/* ── 科目編集モーダル ── */}
      <Modal visible={editVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditVisible(false)}>
              <Text style={styles.modalCancel}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>科目情報を編集</Text>
            <TouchableOpacity onPress={handleEditSave} disabled={!editName.trim() || editSaving}>
              <Text style={[styles.modalSave, (!editName.trim() || editSaving) && { opacity: 0.4 }]}>
                {editSaving ? '保存中...' : '保存'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {/* カラー */}
            <Text style={styles.formLabel}>カラー</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginBottom: 20, paddingVertical: 6 }}>
              {SUBJECT_COLORS.map(c => (
                <TouchableOpacity key={c} style={[styles.colorDot, { backgroundColor: c }, editColor === c && styles.colorDotSelected]} onPress={() => setEditColor(c)} />
              ))}
            </ScrollView>
            <FormInput label="科目名 *" value={editName} onChangeText={setEditName} placeholder="例：線形代数学" />
            <FormInput label="教室"    value={editRoom}    onChangeText={setEditRoom}    placeholder="例：A棟301" />
            <FormInput label="教員名"  value={editTeacher} onChangeText={setEditTeacher} placeholder="例：田中教授" />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── 出席記録モーダル ── */}
      <Modal visible={attVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAttVisible(false)}><Text style={styles.modalCancel}>キャンセル</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>出席を記録</Text>
            <TouchableOpacity onPress={handleAttSave} disabled={attSaving}>
              <Text style={[styles.modalSave, attSaving && { opacity: 0.4 }]}>{attSaving ? '保存中...' : '保存'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <InlineDatePicker label="日付" value={attDate} onChange={setAttDate} />
            <Text style={styles.formLabel}>状態</Text>
            <View style={styles.statusBtnRow}>
              {(['present','late','early_leave','absent'] as AttendanceStatus[]).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusBtn, attStatus === s && { backgroundColor: ATT_CONFIG[s].color, borderColor: ATT_CONFIG[s].color }]}
                  onPress={() => setAttStatus(s)}
                >
                  <Text style={[styles.statusBtnText, attStatus === s && { color: '#fff' }]}>{ATT_CONFIG[s].label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <FormInput label="メモ（任意）" value={attNote} onChangeText={setAttNote} placeholder="例：遅刻理由など" />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── イベント追加モーダル ── */}
      <Modal visible={evtVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEvtVisible(false)}><Text style={styles.modalCancel}>キャンセル</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>イベントを追加</Text>
            <TouchableOpacity onPress={handleEvtSave} disabled={evtSaving}>
              <Text style={[styles.modalSave, evtSaving && { opacity: 0.4 }]}>{evtSaving ? '保存中...' : '保存'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>種類</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 16 }}>
              {(Object.keys(EVENT_CONFIG) as EventType[]).map(t => {
                const cfg = EVENT_CONFIG[t];
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.evtTypeChip, evtType === t && { backgroundColor: cfg.color }]}
                    onPress={() => { setEvtType(t); if (!evtTitle.trim()) setEvtTitle(cfg.label); }}
                  >
                    <Text style={[styles.evtTypeChipText, evtType === t && { color: '#fff' }]}>{cfg.emoji} {cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <InlineDatePicker label="日付" value={evtDate} onChange={setEvtDate} />
            <FormInput label="タイトル *" value={evtTitle} onChangeText={setEvtTitle} placeholder="例：第3回 小テスト" />
            <FormInput label="備考（任意）" value={evtNote} onChangeText={setEvtNote} placeholder="例：教科書1〜3章" />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── スケジュール追加モーダル ── */}
      <Modal visible={schVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSchVisible(false)}><Text style={styles.modalCancel}>キャンセル</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>スケジュールを追加</Text>
            <TouchableOpacity onPress={handleSchSave} disabled={schSaving}>
              <Text style={[styles.modalSave, schSaving && { opacity: 0.4 }]}>{schSaving ? '保存中...' : '保存'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>回数</Text>
            <View style={styles.sessionNumRow}>
              {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(n => (
                <TouchableOpacity key={n} style={[styles.sessionNumBtn, schNum === n && styles.sessionNumBtnActive]} onPress={() => setSchNum(n)}>
                  <Text style={[styles.sessionNumText, schNum === n && styles.sessionNumTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <FormInput label="内容 *" value={schTitle} onChangeText={setSchTitle} placeholder="例：ガイダンス / レポート説明" />
            <InlineDatePicker label="日付（任意）" value={schDate} onChange={setSchDate} optional placeholder="未設定（タップして選択）" />
            <FormInput label="詳細（任意）" value={schDesc} onChangeText={setSchDesc} placeholder="例：教科書pp.1-20を予習" />
          </ScrollView>
        </SafeAreaView>
      </Modal>


    </SafeAreaView>
  );
}

// ── 汎用コンポーネント ────────────────────────────────────────────
function Section({ title, subtitle, action, children }: {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  children: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.container}>
      <View style={sectionStyles.header}>
        <View>
          <Text style={sectionStyles.title}>{title}</Text>
          {subtitle && <Text style={sectionStyles.subtitle}>{subtitle}</Text>}
        </View>
        {action && (
          <TouchableOpacity onPress={action.onPress} style={sectionStyles.actionBtn}>
            <Text style={sectionStyles.actionText}>{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 11, color: COLORS.gray400, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function FormInput({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={styles.formInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.gray400}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: { backgroundColor: COLORS.white, borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  title:     { fontSize: 15, fontWeight: '800', color: COLORS.gray900 },
  subtitle:  { fontSize: 11, color: COLORS.gray400, marginTop: 1 },
  actionBtn: { backgroundColor: COLORS.primaryLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  actionText:{ fontSize: 12, fontWeight: '700', color: COLORS.primary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  body:      { padding: 12, paddingBottom: 40 },

  // ヘッダー
  header:        { paddingTop: 8, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  backBtn:       { paddingTop: 4 },
  backText:      { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  headerCenter:  { flex: 1 },
  headerSubject: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  headerMeta:    { fontSize: 12, color: COLORS.gray600, marginTop: 2 },
  headerInfo:    { fontSize: 12, color: COLORS.gray400, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  headerBtn:     { paddingHorizontal: 8, paddingVertical: 4 },
  headerBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // 統計
  statsCard:     { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 8 },
  progressWrap:  { paddingHorizontal: 16, paddingBottom: 8, position: 'relative' },
  progressTrack: { height: 8, backgroundColor: COLORS.gray100, borderRadius: 4, overflow: 'hidden' },
  progressFill:  { height: 8, borderRadius: 4 },
  progressLine:  { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: COLORS.gray400, alignItems: 'center' },
  progressLineLabel: { position: 'absolute', top: 10, fontSize: 9, color: COLORS.gray400, width: 28, textAlign: 'center', marginLeft: -13 },
  attBreakdown:  { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' },
  breakdownChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  breakdownText: { fontSize: 12, fontWeight: '700' },

  // 記録行
  recordRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  recordDate:   { fontSize: 13, color: COLORS.gray600, width: 90 },
  recordBadge:  { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  recordStatus: { fontSize: 12, fontWeight: '700' },
  recordNote:   { flex: 1, fontSize: 11, color: COLORS.gray400 },
  deleteRowBtn:  { padding: 4 },
  deleteRowText: { fontSize: 12, color: COLORS.gray400 },
  showMoreBtn:   { paddingVertical: 10, alignItems: 'center' },
  showMoreText:  { fontSize: 12, color: COLORS.primary, fontWeight: '600' },

  // イベント行
  eventRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.gray100, gap: 10 },
  eventTypeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 2 },
  eventTypeText:  { fontSize: 11, fontWeight: '700' },
  eventContent:   { flex: 1 },
  eventDate:      { fontSize: 11, color: COLORS.gray400 },
  eventTitle:     { fontSize: 13, fontWeight: '600', color: COLORS.gray900 },
  eventNote:      { fontSize: 11, color: COLORS.gray400, marginTop: 2 },

  // スケジュール行
  scheduleRow:     { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.gray100, gap: 12 },
  scheduleNum:     { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  scheduleNumText: { fontSize: 14, fontWeight: '800' },
  scheduleContent: { flex: 1 },
  scheduleTitle:   { fontSize: 13, fontWeight: '600', color: COLORS.gray900 },
  scheduleMeta:    { fontSize: 11, color: COLORS.gray400, marginTop: 2 },

  // メモ
  memoInput: {
    minHeight: 120, padding: 16, fontSize: 14, color: COLORS.gray900,
    lineHeight: 22, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  emptyHint: { fontSize: 13, color: COLORS.gray400, padding: 16 },

  // モーダル共通
  modalContainer: { flex: 1, backgroundColor: COLORS.white },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  modalTitle:     { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  modalCancel:    { fontSize: 15, color: COLORS.gray600 },
  modalSave:      { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  formLabel:      { fontSize: 13, fontWeight: '700', color: COLORS.gray600, marginBottom: 6 },
  formInput:      { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.gray900, backgroundColor: COLORS.gray50 },

  // 日付トリガー
  dateTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: COLORS.primaryLight,
  },
  dateTriggerText:    { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.primary },
  dateTriggerChevron: { fontSize: 18, color: COLORS.primary },

  // カラードット
  colorDot:         { width: 32, height: 32, borderRadius: 16 },
  colorDotSelected: { borderWidth: 3, borderColor: COLORS.gray900, transform: [{ scale: 1.15 }] },

  // 出席状態ボタン
  statusBtnRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statusBtn:     { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  statusBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.gray600 },

  // イベントタイプチップ
  evtTypeChip:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  evtTypeChipText:{ fontSize: 13, fontWeight: '600', color: COLORS.gray900 },

  // 回数ボタン
  sessionNumRow:        { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 16 },
  sessionNumBtn:        { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gray200, backgroundColor: COLORS.white },
  sessionNumBtnActive:  { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sessionNumText:       { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  sessionNumTextActive: { color: '#fff' },
});
