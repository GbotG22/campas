import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated,
  Dimensions, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { COLORS, SPACING, RADIUS, SHADOW, DAY_LABELS, SUBJECT_COLORS } from '@/constants/theme';
import { rescheduleAllClassNotifications } from '@/lib/notifications';
import { ATT_CONFIG, useAttendance }           from '@/hooks/useAttendance';
import { fetchTodayEvents, ClassEvent }        from '@/hooks/useClassEvents';
import { usePeriodSettings }                   from '@/hooks/usePeriodSettings';
import { useSemesters }                        from '@/hooks/useSemesters';
import { useTimetable }                        from '@/hooks/useTimetable';
import { useAuthStore }                        from '@/stores/auth.store';
import { localYMD }                            from '@/lib/dateUtils';
import type { Database }                       from '@/types/database';

type Slot = Database['public']['Tables']['timetable_slots']['Row'];

// ── レイアウト定数 ─────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const PERIOD_COL = 54;
const CELL_W     = Math.floor((SCREEN_W - PERIOD_COL - 14) / 5);
const CELL_H     = 82;               // セル高さの下限（これより小さくはしない）
const HEADER_ROW_H   = 32;           // 曜日ヘッダー行のおおよその高さ
const ROW_GAP        = 2;            // row の marginBottom
const GRID_PAD_BOTTOM = SPACING.md;  // grid の paddingBottom

interface CopyData { subject_name: string; teacher_name: string | null; room: string | null; color: string }

export default function TimetableScreen() {
  const { user }   = useAuthStore();
  const { semesters, activeSemester, setActive } = useSemesters();
  const { config: periodConfig } = usePeriodSettings();

  // 学期が1つ以上あれば activeSemester?.id でフィルタ、なければ全件
  const semesterFilter = semesters.length > 0
    ? (activeSemester?.id ?? null)  // null = semester_id IS NULL
    : undefined;                    // undefined = 全件（後方互換）

  const { slots, isLoading, isOffline, addSlot, deleteSlot, refresh } =
    useTimetable(semesterFilter);
  const { getForDate, getStats, record } = useAttendance();

  // フォーカス時に today を再計算する（日付跨ぎ対策）
  const [, forceUpdate] = useState(0);

  // スロット詳細（/slot/[id]）から戻ったとき等、フォーカス取得時に最新データへ更新
  useFocusEffect(
    useCallback(() => {
      refresh();
      forceUpdate(n => n + 1);
    }, [refresh]),
  );

  // ── 日付（毎レンダーで再計算） ───────────────────────────────
  const today    = new Date();
  const todayStr = localYMD(today);
  const todayDow = (() => { const d = today.getDay(); return d === 0 || d === 6 ? -1 : d - 1; })();

  // ── アクティブ時限設定 ─────────────────────────────────────
  const activePeriods = useMemo(
    () => periodConfig.periods.slice(0, periodConfig.periodCount),
    [periodConfig],
  );

  // ── セル高さを利用可能な高さから動的算出 ───────────────────
  // 時限数が少ない（4限など）ときに下部が大きく余るのを防ぎ、
  // 画面の縦いっぱいにセルを広げる。多い場合は CELL_H を保ってスクロール。
  const [gridH, setGridH] = useState(0);
  const cellH = useMemo(() => {
    const count = activePeriods.length || 1;
    if (gridH <= 0) return CELL_H;
    const avail = gridH - HEADER_ROW_H - GRID_PAD_BOTTOM - count * ROW_GAP;
    return Math.max(CELL_H, Math.floor(avail / count));
  }, [gridH, activePeriods.length]);

  // ── 今日の休講・補講 ──────────────────────────────────────
  const [todayEvents, setTodayEvents] = useState<Map<string, ClassEvent>>(new Map());
  useEffect(() => {
    if (!user || !slots.length) return;
    fetchTodayEvents(user.id, slots.map(s => s.id), todayStr)
      .then(setTodayEvents);
  }, [user, slots, todayStr]);

  // ── ボトムシート状態 ──────────────────────────────────────
  const [sheetVisible, setSheetVisible] = useState(false);
  const [targetCell,   setTargetCell]   = useState<{ day: number; period: number } | null>(null);
  const slideAnim = useRef(new Animated.Value(600)).current;

  // ── フォーム状態 ──────────────────────────────────────────
  const [subjectName, setSubjectName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [room,        setRoom]        = useState('');
  const [color,       setColor]       = useState<string>(SUBJECT_COLORS[0]);
  const [saving,      setSaving]      = useState(false);

  // ── コピーモーダル状態 ────────────────────────────────────
  const [copyVisible,  setCopyVisible]  = useState(false);
  const [copyData,     setCopyData]     = useState<CopyData | null>(null);
  const [copySelected, setCopySelected] = useState<Set<string>>(new Set());

  // ── スロット検索 ──────────────────────────────────────────
  const getSlot = useCallback(
    (day: number, period: number) => slots.find(s => s.day_of_week === day && s.period === period) ?? null,
    [slots],
  );

  // ── 科目候補 ──────────────────────────────────────────────
  const allSubjects = useMemo(() => {
    const seen = new Map<string, Slot>();
    slots.forEach(s => { if (!seen.has(s.subject_name)) seen.set(s.subject_name, s); });
    return Array.from(seen.values());
  }, [slots]);

  const suggestions = useMemo(
    () => subjectName.trim()
      ? allSubjects.filter(s => s.subject_name.includes(subjectName.trim()))
      : allSubjects,
    [allSubjects, subjectName],
  );

  // ── シート開閉 ────────────────────────────────────────────
  function openSheet(day: number, period: number) {
    setTargetCell({ day, period });
    setSubjectName(''); setTeacherName(''); setRoom(''); setColor(SUBJECT_COLORS[0]);
    setSheetVisible(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
  }

  function closeSheet() {
    Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start(() => {
      setSheetVisible(false);
    });
  }

  // ── 追加 ─────────────────────────────────────────────────
  async function handleSave() {
    if (!targetCell || !subjectName.trim()) return;
    setSaving(true);
    const payload: CopyData = {
      subject_name:  subjectName.trim(),
      teacher_name:  teacherName.trim() || null,
      room:          room.trim() || null,
      color,
    };
    const error = await addSlot({
      ...payload,
      day_of_week:              targetCell.day,
      period:                   targetCell.period,
      google_calendar_event_id: null,
      semester:                 activeSemester?.id ?? null,
    });
    setSaving(false);
    if (error) { Alert.alert('エラー', '追加できませんでした'); return; }
    rescheduleAllClassNotifications(slots, periodConfig).catch(() => {});
    closeSheet();
    setTimeout(() => {
      Alert.alert(
        '他のコマにもコピー',
        `「${payload.subject_name}」を別の曜日・時限にも追加しますか？`,
        [
          { text: 'スキップ', style: 'cancel' },
          {
            text: 'コピーする',
            onPress: () => { setCopyData(payload); setCopySelected(new Set()); setCopyVisible(true); },
          },
        ],
      );
    }, 300);
  }

  // ── 長押し → 出席クイック入力 ───────────────────────────
  function handleLongPress(slot: Slot) {
    const current = getForDate(slot.id, todayStr);
    Alert.alert(
      slot.subject_name,
      `今日（${todayStr}）の出席`,
      [
        { text: '✓ 出席', onPress: () => record(slot.id, todayStr, 'present') },
        { text: '△ 遅刻', onPress: () => record(slot.id, todayStr, 'late')    },
        { text: '✗ 欠席', onPress: () => record(slot.id, todayStr, 'absent')  },
        { text: '↩ 早退', onPress: () => record(slot.id, todayStr, 'early_leave') },
        ...(current ? [{ text: '記録を削除', style: 'destructive' as const, onPress: () => record(slot.id, todayStr, 'absent') }] : []),
        { text: 'キャンセル', style: 'cancel' },
      ],
    );
  }

  // ── コピー ───────────────────────────────────────────────
  function toggleCopy(day: number, period: number) {
    const key  = `${day}_${period}`;
    const next = new Set(copySelected);
    if (next.has(key)) next.delete(key); else next.add(key);
    setCopySelected(next);
  }

  async function handleCopyExecute() {
    if (!copyData) return;
    setSaving(true);
    for (const key of copySelected) {
      const [d, p] = key.split('_').map(Number);
      await addSlot({ ...copyData, day_of_week: d, period: p, google_calendar_event_id: null, semester: activeSemester?.id ?? null });
    }
    setSaving(false);
    rescheduleAllClassNotifications(slots, periodConfig).catch(() => {});
    setCopyVisible(false);
  }

  // ── 学期ナビゲーション ───────────────────────────────────
  function navigateSemester(dir: 1 | -1) {
    if (!semesters.length) return;
    const idx = semesters.findIndex(s => s.id === activeSemester?.id);
    const next = semesters[idx + dir];
    if (next) setActive(next.id);
  }

  // ── レンダリング ─────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── ヘッダー ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>時間割</Text>
          <Text style={styles.subtitle}>タップ: 詳細 ／ 長押し: 出席入力</Text>
        </View>

        <View style={styles.headerRight}>
          {isOffline && (
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>オフライン</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push('/settings/timetable-settings' as never)}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 学期セレクター ── */}
      <View style={styles.semesterBar}>
        <TouchableOpacity
          style={styles.semesterArrow}
          onPress={() => navigateSemester(-1)}
          disabled={!semesters.length || semesters[0]?.id === activeSemester?.id}
        >
          <Text style={[styles.semesterArrowText, (!semesters.length || semesters[0]?.id === activeSemester?.id) && { opacity: 0.2 }]}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.semesterName}
          onPress={() => router.push('/settings/timetable-settings' as never)}
        >
          <Text style={styles.semesterNameText}>
            {activeSemester?.name ?? (semesters.length > 0 ? '（未選択）' : '学期を設定')}
          </Text>
          {!semesters.length && <Text style={styles.semesterSetupHint}> › 設定</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.semesterArrow}
          onPress={() => navigateSemester(1)}
          disabled={!semesters.length || semesters[semesters.length - 1]?.id === activeSemester?.id}
        >
          <Text style={[styles.semesterArrowText, (!semesters.length || semesters[semesters.length - 1]?.id === activeSemester?.id) && { opacity: 0.2 }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── グリッド ── */}
      {isLoading && slots.length === 0 ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      ) : (
        <ScrollView
          style={styles.gridScroll}
          showsVerticalScrollIndicator={false}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - gridH) > 0.5) setGridH(h);
          }}
        >
          <View style={styles.grid}>

            {/* 曜日ヘッダー */}
            <View style={styles.row}>
              <View style={{ width: PERIOD_COL }} />
              {DAY_LABELS.map((d, i) => (
                <View key={d} style={[styles.dayHeader, { width: CELL_W }, i === todayDow && styles.todayHeader]}>
                  <Text style={[styles.dayHeaderText, i === todayDow && styles.todayHeaderText]}>{d}</Text>
                </View>
              ))}
            </View>

            {/* 時限 × 曜日 */}
            {activePeriods.map((pt) => (
              <View key={pt.period} style={styles.row}>

                {/* 左端：時限＋時刻 */}
                <View style={[styles.periodLabel, { width: PERIOD_COL }]}>
                  <Text style={styles.periodNum}>{pt.period}限</Text>
                  <Text style={styles.periodTime}>{pt.start}</Text>
                </View>

                {/* 各曜日セル */}
                {DAY_LABELS.map((_, di) => {
                  const slot       = getSlot(di, pt.period);
                  const attendance = slot ? getForDate(slot.id, todayStr) : null;
                  const stats      = slot ? getStats(slot.id, periodConfig.requiredRate) : null;
                  const todayEvt   = slot ? todayEvents.get(slot.id) : undefined;
                  const isCancel   = todayEvt?.event_type === 'cancel';
                  const isMakeup   = todayEvt?.event_type === 'makeup';

                  return slot ? (
                    <TouchableOpacity
                      key={di}
                      style={[
                        styles.cell,
                        {
                          width:           CELL_W,
                          height:          cellH,
                          backgroundColor: isCancel
                            ? COLORS.gray100
                            : (slot.color ?? COLORS.primary) + '18',
                          borderLeftColor: isCancel ? COLORS.gray400 : (slot.color ?? COLORS.primary),
                          borderLeftWidth: 3,
                        },
                      ]}
                      onPress={() => router.push(`/slot/${slot.id}` as never)}
                      onLongPress={() => handleLongPress(slot)}
                      activeOpacity={0.75}
                    >
                      {/* 出席インジケーター dot */}
                      {attendance && (
                        <View style={[styles.attDot, { backgroundColor: ATT_CONFIG[attendance].color }]} />
                      )}

                      {/* 休講・補講バッジ */}
                      {(isCancel || isMakeup) && (
                        <View style={[styles.eventBadge, { backgroundColor: isCancel ? COLORS.danger : COLORS.success }]}>
                          <Text style={styles.eventBadgeText}>{isCancel ? '休' : '補'}</Text>
                        </View>
                      )}

                      <Text
                        style={[styles.cellSubject, { color: isCancel ? COLORS.gray400 : (slot.color ?? COLORS.primary) }]}
                        numberOfLines={2}
                      >
                        {slot.subject_name}
                      </Text>
                      {slot.room         && <Text style={styles.cellRoom}    numberOfLines={1}>📍{slot.room}</Text>}
                      {slot.teacher_name && <Text style={styles.cellTeacher} numberOfLines={1}>👤{slot.teacher_name}</Text>}

                      {/* 出席率チップ */}
                      {stats && stats.total > 0 && (
                        <View style={[styles.rateChip, { backgroundColor: stats.isWarning ? COLORS.dangerLight : COLORS.successLight }]}>
                          <Text style={[styles.rateChipText, { color: stats.isWarning ? COLORS.danger : COLORS.success }]}>
                            {stats.rate}%
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      key={di}
                      style={[styles.cell, styles.emptyCell, { width: CELL_W, height: cellH }, di === todayDow && styles.todayCell]}
                      onPress={() => openSheet(di, pt.period)}
                      activeOpacity={0.5}
                    >
                      <Text style={styles.addIcon}>+</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── ボトムシート（新規追加のみ） ── */}
      <Modal visible={sheetVisible} transparent animationType="none" onRequestClose={closeSheet}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeSheet} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetWrapper}
        >
          <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.handle} />

            {/* タイトル */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {targetCell ? `${DAY_LABELS[targetCell.day]}曜 ${targetCell.period}限に追加` : '授業を追加'}
              </Text>
            </View>

            <View style={{ paddingHorizontal: 16 }}>

              {/* ─ カラーピッカー（1行で全色表示） ─ */}
              <View style={styles.colorRow}>
                {SUBJECT_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotSelected]}
                    onPress={() => setColor(c)}
                  />
                ))}
              </View>

              {/* ─ 科目名 ─ */}
              <TextInput
                style={[styles.mainInput, { borderColor: color }]}
                placeholder="科目名を入力"
                placeholderTextColor={COLORS.gray400}
                value={subjectName}
                onChangeText={setSubjectName}
                returnKeyType="next"
                autoFocus={false}
              />

              {/* ─ 候補チップ（最大5件、横スクロール） ─ */}
              {suggestions.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, marginBottom: 10 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {suggestions.slice(0, 5).map(s => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.suggestionChip, { borderColor: s.color ?? COLORS.primary }]}
                      onPress={() => {
                        setSubjectName(s.subject_name);
                        setTeacherName(s.teacher_name ?? '');
                        setRoom(s.room ?? '');
                        setColor(s.color ?? SUBJECT_COLORS[0]);
                      }}
                    >
                      <View style={[styles.suggestionDot, { backgroundColor: s.color ?? COLORS.primary }]} />
                      <Text style={styles.suggestionText}>{s.subject_name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* ─ 教室・教員名（常に表示） ─ */}
              <View style={styles.subRow}>
                <TextInput
                  style={[styles.subInput, { flex: 1 }]}
                  placeholder="📍 教室"
                  value={room}
                  onChangeText={setRoom}
                  placeholderTextColor={COLORS.gray400}
                  returnKeyType="next"
                />
                <TextInput
                  style={[styles.subInput, { flex: 1 }]}
                  placeholder="👤 教員名"
                  value={teacherName}
                  onChangeText={setTeacherName}
                  placeholderTextColor={COLORS.gray400}
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* ─ 追加ボタン ─ */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: color }, (!subjectName.trim() || saving) && { opacity: 0.4 }]}
              onPress={handleSave}
              disabled={!subjectName.trim() || saving}
            >
              <Text style={styles.saveBtnText}>{saving ? '追加中...' : '追加'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── コピーモーダル ── */}
      <Modal visible={copyVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setCopyVisible(false)}>
              <Text style={styles.modalCancelText}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>コピー先を選択</Text>
            <TouchableOpacity onPress={handleCopyExecute} disabled={copySelected.size === 0 || saving}>
              <Text style={[styles.modalSaveText, (copySelected.size === 0 || saving) && { opacity: 0.4 }]}>
                {saving ? '追加中...' : `${copySelected.size}件追加`}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={styles.copyHint}>「{copyData?.subject_name}」をコピーするコマをタップ</Text>

            <View>
              <View style={styles.row}>
                <View style={{ width: PERIOD_COL }} />
                {DAY_LABELS.map(d => (
                  <View key={d} style={[styles.copyHeaderCell, { width: CELL_W }]}>
                    <Text style={styles.copyHeaderText}>{d}</Text>
                  </View>
                ))}
              </View>

              {activePeriods.map((pt) => (
                <View key={pt.period} style={styles.row}>
                  <View style={[styles.periodLabel, { width: PERIOD_COL }]}>
                    <Text style={styles.periodNum}>{pt.period}限</Text>
                  </View>
                  {DAY_LABELS.map((_, di) => {
                    const existing = getSlot(di, pt.period);
                    const key      = `${di}_${pt.period}`;
                    const selected = copySelected.has(key);
                    return (
                      <TouchableOpacity
                        key={di}
                        style={[
                          styles.copyCell,
                          { width: CELL_W, height: CELL_H - 10 },
                          existing  && styles.copyCellOccupied,
                          selected  && styles.copyCellSelected,
                        ]}
                        onPress={() => !existing && toggleCopy(di, pt.period)}
                        disabled={!!existing}
                        activeOpacity={0.7}
                      >
                        {existing  ? <Text style={styles.copyCellOccText} numberOfLines={2}>{existing.subject_name}</Text>
                         : selected ? <Text style={styles.copyCellSelText}>✓</Text>
                         : <Text style={styles.copyCellEmptyText}>+</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

// ── スタイル ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.gray50 },
  gridScroll: { flex: 1 },

  // ヘッダー
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.sm + 4, paddingTop: SPACING.xs + 2, paddingBottom: SPACING.xs },
  headerLeft:       { flex: 1 },
  headerRight:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs + 2 },
  title:            { fontSize: 22, fontWeight: '800', color: COLORS.gray900 },
  subtitle:         { fontSize: 11, color: COLORS.gray400, marginTop: 2 },
  offlineBadge:     { backgroundColor: COLORS.warningLight, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  offlineBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.warning },
  settingsBtn:      { padding: SPACING.xs },
  settingsIcon:     { fontSize: 20 },

  // 学期バー
  semesterBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.sm + 4, paddingBottom: SPACING.xs + 2 },
  semesterArrow:     { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  semesterArrowText: { fontSize: 22, color: COLORS.primary, fontWeight: '700' },
  semesterName:      { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  semesterNameText:  { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  semesterSetupHint: { fontSize: 12, color: COLORS.primary },

  // グリッド
  grid: { paddingHorizontal: SPACING.xs + 2, paddingBottom: SPACING.md },
  row:  { flexDirection: 'row', marginBottom: 2 },

  // 曜日ヘッダー
  dayHeader:       { alignItems: 'center', paddingVertical: 6 },
  dayHeaderText:   { fontSize: 13, fontWeight: '700', color: COLORS.gray600 },
  todayHeader:     { backgroundColor: COLORS.primary + '18', borderRadius: RADIUS.sm },
  todayHeaderText: { color: COLORS.primary },

  // 時限ラベル（時刻も読めるサイズに）
  periodLabel: { justifyContent: 'center', alignItems: 'center', paddingVertical: 2 },
  periodNum:   { fontSize: 11, fontWeight: '700', color: COLORS.gray600 },
  periodTime:  { fontSize: 10, color: COLORS.gray400, marginTop: 1 },

  // セル
  cell:      { marginHorizontal: 1, borderRadius: RADIUS.sm, padding: 5, borderWidth: 1, borderColor: COLORS.gray200, position: 'relative' },
  emptyCell: { backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  todayCell: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary + '40' },
  addIcon:   { fontSize: 20, color: COLORS.gray300 },

  // セル内テキスト（視認性向上）
  cellSubject: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  cellRoom:    { fontSize: 9,  color: COLORS.gray500, marginTop: 2 },
  cellTeacher: { fontSize: 9,  color: COLORS.gray400 },

  // 出席インジケーター（右上ドット → より目立つサイズ）
  attDot:       { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.white },
  rateChip:     { marginTop: 3, borderRadius: RADIUS.sm - 2, paddingHorizontal: 4, paddingVertical: 2, alignSelf: 'flex-start' },
  rateChipText: { fontSize: 10, fontWeight: '700' },

  // 休講・補講バッジ
  eventBadge:     { position: 'absolute', top: 4, left: 4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  eventBadgeText: { fontSize: 8, fontWeight: '900', color: '#fff' },

  // ボトムシート
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.md, paddingTop: SPACING.sm,
  },
  handle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.gray200, alignSelf: 'center', marginBottom: SPACING.sm + 2 },
  sheetHeader: { paddingHorizontal: SPACING.md, marginBottom: SPACING.sm + 2 },
  sheetTitle:  { fontSize: 15, fontWeight: '700', color: COLORS.gray600 },

  // カラーピッカー
  colorRow:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm + 4, paddingVertical: 6 },
  colorDot:         { width: 30, height: 30, borderRadius: 15 },
  colorDotSelected: { borderWidth: 3, borderColor: COLORS.gray900, transform: [{ scale: 1.15 }] },

  // フォーム
  mainInput: {
    borderWidth: 2, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 4, paddingVertical: SPACING.sm + 2,
    fontSize: 16, fontWeight: '600',
    color: COLORS.gray900, marginBottom: SPACING.sm,
  },
  subRow:   { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xs },
  subInput: {
    borderWidth: 1.5, borderColor: COLORS.gray200, borderRadius: RADIUS.sm + 2,
    paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.sm + 2,
    fontSize: 13, color: COLORS.gray900, backgroundColor: COLORS.gray50,
  },

  // 入力補完チップ
  suggestionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2, paddingVertical: 5,
    backgroundColor: COLORS.white,
  },
  suggestionDot:  { width: 8, height: 8, borderRadius: 4 },
  suggestionText: { fontSize: 12, fontWeight: '600', color: COLORS.gray900 },

  // 保存ボタン
  saveBtn:     { marginHorizontal: SPACING.md, marginTop: SPACING.sm + 2, borderRadius: RADIUS.md, padding: 15, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // コピーモーダル
  modalContainer:   { flex: 1, backgroundColor: COLORS.white },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 6, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  modalTitle:       { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  modalCancelText:  { fontSize: 15, color: COLORS.gray600 },
  modalSaveText:    { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  copyHint:         { fontSize: 13, color: COLORS.gray400, marginBottom: SPACING.md },
  copyHeaderCell:   { alignItems: 'center', paddingVertical: 6 },
  copyHeaderText:   { fontSize: 13, fontWeight: '700', color: COLORS.gray600 },
  copyCell:         { marginHorizontal: 1, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.gray200, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  copyCellOccupied: { backgroundColor: COLORS.gray100 },
  copyCellSelected: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  copyCellOccText:  { fontSize: 9, color: COLORS.gray400, textAlign: 'center', padding: 2 },
  copyCellSelText:  { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  copyCellEmptyText:{ fontSize: 16, color: COLORS.gray300 },
});
