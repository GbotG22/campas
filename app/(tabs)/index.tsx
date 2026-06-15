import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFocusEffect } from 'expo-router';
import { COLORS, SPACING, RADIUS, SHADOW } from '@/constants/theme';
import MonthCalendar, { CalendarMarker } from '@/components/MonthCalendar';
import { useProfileStore }     from '@/stores/profile.store';
import { localYMD }            from '@/lib/dateUtils';
import { useSubscriptions }    from '@/hooks/useSubscriptions';
import { useEvents, EVENT_CONFIG }   from '@/hooks/useEvents';
import { useShifts }           from '@/hooks/useShifts';
import { useIncomes }          from '@/hooks/useIncomes';
import { useTimetable }        from '@/hooks/useTimetable';
import { useSemesters }        from '@/hooks/useSemesters';
import { useExpenses }         from '@/hooks/useExpenses';
import { useAttendance, ATT_CONFIG } from '@/hooks/useAttendance';
import { useTodayClassEvents } from '@/hooks/useClassEvents';
import { useNativeCalendar } from '@/hooks/useNativeCalendar';

function getYM(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function fmt(d: Date)   { return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }

// 今日の授業の操作ボタン: 出席 / 欠席 / 休講
// 出席・欠席は attendance_records、休講は class_events(cancel) に記録する。
const ATT_BUTTONS = [
  { key: 'present', label: '出席', color: ATT_CONFIG.present.color },
  { key: 'absent',  label: '欠席', color: ATT_CONFIG.absent.color },
  { key: 'cancel',  label: '休講', color: COLORS.gray500 },
] as const;

export default function HomeScreen() {
  // フォーカス時に today を再計算する（日付跨ぎ対策）
  const [, forceUpdate] = useState(0);

  const { displayName } = useProfileStore();
  const { monthlyTotal: subTotal }                          = useSubscriptions();
  const { events, getForDate: getEvents, getUpcoming, toggleDone } = useEvents();
  const { shifts, getForDate: getShifts, getNextShift }      = useShifts();
  const { getMonthlyTotal }                                 = useIncomes();
  const { semesters, activeSemester }                       = useSemesters();
  // 時間割タブと同じ学期フィルタ: 学期があればアクティブ学期で絞る（null=未割当）。
  // 学期未設定なら undefined=全件表示（従来挙動を維持）。
  const semesterFilter = semesters.length > 0
    ? (activeSemester?.id ?? null)
    : undefined;
  const { slots, refresh: refreshTimetable }                = useTimetable(semesterFilter);
  const { expenses, refresh: refreshExpenses }              = useExpenses();
  const { record: recordAttendance, deleteRecord, getForDate: getAttendance, load: loadAttendance } = useAttendance();

  // フォーカス取得時に最新データへ更新（他タブ・詳細画面での変更を反映）
  useFocusEffect(useCallback(() => {
    forceUpdate(n => n + 1);
    refreshTimetable();
    refreshExpenses();
    loadAttendance();
  }, [refreshTimetable, refreshExpenses, loadAttendance]));

  const today    = new Date();
  const todayStr = localYMD(today);
  const todayDow = (() => { const d = today.getDay(); return d === 0 || d === 6 ? -1 : d - 1; })();
  const { nativeEvents, isConnected: nativeConnected } = useNativeCalendar();

  const hour     = today.getHours();
  const greeting = hour < 10 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'お疲れ様です';

  // 表示名: 設定済みの表示名のみ（メールアドレスは表示しない）
  const userName = displayName ?? '';

  // ── カレンダー月制御 ──────────────────────────────────────
  const [calYear,  setCalYear]  = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth() + 1);
  const [selDate,  setSelDate]  = useState<string>(() => localYMD(new Date()));

  function prevMonth() {
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); }
    else setCalMonth(m => m + 1);
  }

  // ── カレンダーマーカー ────────────────────────────────────
  const markers = useMemo((): CalendarMarker[] => {
    const out: CalendarMarker[] = [];
    events.forEach(e => out.push({ date: e.start_date, color: EVENT_CONFIG[e.event_type].color }));
    shifts.forEach(s => out.push({ date: s.date, color: COLORS.success }));
    if (nativeConnected) {
      nativeEvents.forEach(e => out.push({ date: e.date, color: e.color }));
    }
    return out;
  }, [events, shifts, nativeEvents, nativeConnected]);

  // ── 選択日のデータ ────────────────────────────────────────
  const selEvents       = getEvents(selDate);
  const selShifts       = getShifts(selDate);
  const selNativeEvents = useMemo(
    () => nativeConnected ? nativeEvents.filter(e => e.date === selDate) : [],
    [nativeEvents, nativeConnected, selDate],
  );

  // ── 今日の時間割 ─────────────────────────────────────────
  const todaySlots = useMemo(() => {
    if (todayDow < 0) return [];
    return slots.filter(s => s.day_of_week === todayDow).sort((a, b) => a.period - b.period);
  }, [slots, todayDow]);

  // 今日の休講・補講（時間割で登録されたもの）を授業枠に紐づけて表示する
  const todaySlotIds = useMemo(() => todaySlots.map(s => s.id), [todaySlots]);
  const { todayEvents: todayClassEvents, toggleCancel } = useTodayClassEvents(todaySlotIds, todayStr);

  // ── 締切（今日 / 明日以降） ───────────────────────────────
  const upcoming          = getUpcoming(7);
  const todayDeadlines    = upcoming.filter(e => e.start_date === todayStr);
  const upcomingDeadlines = upcoming.filter(e => e.start_date > todayStr);

  // ── 次回勤務 ──────────────────────────────────────────────
  const nextShift = getNextShift();
  const nextShiftDays = nextShift ? (() => {
    const d = new Date(nextShift.date + 'T00:00:00');
    const t = new Date(todayStr + 'T00:00:00');
    return Math.ceil((d.getTime() - t.getTime()) / 86400000);
  })() : 0;
  const nextShiftDayLabel = !nextShift ? '' : nextShiftDays === 0 ? '今日' : nextShiftDays === 1 ? '明日' : `${nextShiftDays}日後`;

  // ── 今月の収支 ────────────────────────────────────────────
  const thisYM      = getYM(today);
  const monthIncome = getMonthlyTotal(thisYM);
  const monthExp    = useMemo(
    () => expenses.filter(e => e.paid_at?.startsWith(thisYM)).reduce((s, e) => s + e.amount, 0),
    [expenses, thisYM],
  );
  const monthBalance = monthIncome - monthExp - subTotal;

  // ── 選択日ラベル ─────────────────────────────────────────
  const selLabel = useMemo(() => {
    if (selDate === todayStr) return '今日';
    const tm = new Date(today); tm.setDate(tm.getDate() + 1);
    if (selDate === localYMD(tm)) return '明日';
    return fmt(new Date(selDate));
  }, [selDate]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── グリーティング ── */}
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>{greeting}</Text>
          {userName ? (
            <Text style={styles.userNameText}>{userName} さん</Text>
          ) : null}
          <Text style={styles.dateText}>
            {fmt(today)}（{['日', '月', '火', '水', '木', '金', '土'][today.getDay()]}）
          </Text>
        </View>

        {/* ── 次のシフト ── */}
        {nextShift && (
          <View style={[styles.card, styles.nextShiftCard]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.sectionTitle}>次のシフト</Text>
              <View style={[styles.nextShiftBadge, { backgroundColor: nextShiftDays <= 1 ? COLORS.successLight : COLORS.gray100 }]}>
                <Text style={[styles.nextShiftBadgeText, { color: nextShiftDays <= 1 ? COLORS.success : COLORS.gray600 }]}>
                  {nextShiftDayLabel}
                </Text>
              </View>
            </View>
            <View style={[styles.eventRow, { borderLeftColor: nextShift.workplace?.color ?? COLORS.success, marginBottom: 0 }]}>
              <Ionicons name="briefcase-outline" size={16} color={nextShift.workplace?.color ?? COLORS.success} style={styles.eventIcon} />
              <View style={styles.eventBody}>
                <Text style={styles.eventTitle}>{nextShift.workplace?.name ?? 'バイト'}</Text>
                <Text style={styles.eventMeta}>
                  {(() => {
                    const d = new Date(nextShift.date + 'T00:00:00');
                    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
                    return `${d.getMonth() + 1}月${d.getDate()}日（${dow}）  ${nextShift.start_time} 〜 ${nextShift.end_time}`;
                  })()}
                </Text>
                <Text style={[styles.eventMeta, { color: COLORS.success, fontWeight: '600', marginTop: 2 }]}>
                  予想 ¥{(nextShift.estimated_wage ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── カレンダー ── */}
        <View style={styles.calCard}>
          <MonthCalendar
            year={calYear}
            month={calMonth}
            selectedDate={selDate}
            onSelectDate={setSelDate}
            markers={markers}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
          />
        </View>

        {/* ── 選択日の予定 ── */}
        <View style={styles.card}>
          <SectionHeader title={`${selLabel}の予定`} />
          {selEvents.length === 0 && selShifts.length === 0 && selNativeEvents.length === 0 && (
            <Text style={styles.emptyText}>予定はありません</Text>
          )}
          {selShifts.map(s => (
            <View key={s.id} style={[styles.eventRow, { borderLeftColor: s.workplace?.color ?? COLORS.success }]}>
              <Ionicons name="briefcase-outline" size={16} color={s.workplace?.color ?? COLORS.success} style={styles.eventIcon} />
              <View style={styles.eventBody}>
                <Text style={styles.eventTitle}>{s.workplace?.name ?? 'バイト'}</Text>
                <Text style={styles.eventMeta}>
                  {s.start_time} 〜 {s.end_time}　¥{(s.estimated_wage ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>
          ))}
          {selEvents.map(e => {
            const cfg = EVENT_CONFIG[e.event_type];
            return (
              <View key={e.id} style={[styles.eventRow, { borderLeftColor: cfg.color }]}>
                <Ionicons name={cfg.icon as any} size={16} color={cfg.color} style={styles.eventIcon} />
                <View style={styles.eventBody}>
                  <Text style={[styles.eventTitle, e.is_done && styles.doneText]}>{e.title}</Text>
                  {e.start_time && (
                    <Text style={styles.eventMeta}>
                      {e.start_time}{e.end_time ? ` 〜 ${e.end_time}` : ''}
                    </Text>
                  )}
                </View>
                <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
            );
          })}
          {selNativeEvents.map(e => (
            <View key={`native_${e.id}`} style={[styles.eventRow, { borderLeftColor: e.color }]}>
              <Ionicons name="phone-portrait-outline" size={16} color={e.color} style={styles.eventIcon} />
              <View style={styles.eventBody}>
                <Text style={styles.eventTitle}>{e.title}</Text>
                <Text style={styles.eventMeta}>
                  {e.time ? `${e.time}${e.endTime ? ` 〜 ${e.endTime}` : ''}` : '終日'}
                  {e.calendarTitle ? `　${e.calendarTitle}` : ''}
                </Text>
              </View>
              <View style={[styles.typeBadge, { backgroundColor: '#F0FDF4' }]}>
                <Text style={[styles.typeBadgeText, { color: e.color }]}>端末</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── 今日の授業（出席ボタン付き） ── */}
        {todaySlots.length > 0 && (
          <View style={styles.card}>
            <SectionHeader title="今日の授業" />
            {todaySlots.map(s => {
              const currentStatus = getAttendance(s.id, todayStr);
              const classEvt = todayClassEvents.get(s.id);
              const isCancel = classEvt?.event_type === 'cancel';
              const isMakeup = classEvt?.event_type === 'makeup';
              // 休講中は出席状況を表示しない（授業自体が無いため）
              const accent = isCancel ? COLORS.gray400 : (s.color ?? COLORS.primary);
              return (
                <View key={s.id} style={styles.slotCard}>
                  {/* 授業情報 */}
                  <View style={[styles.eventRow, { borderLeftColor: accent, marginBottom: 0 }]}>
                    <Ionicons name="book-outline" size={16} color={accent} style={styles.eventIcon} />
                    <View style={styles.eventBody}>
                      <Text style={[styles.eventTitle, isCancel && styles.cancelledText]}>{s.subject_name}</Text>
                      <Text style={styles.eventMeta}>
                        {s.period}限{s.room ? `　${s.room}` : ''}
                      </Text>
                    </View>
                    {/* 休講・補講バッジ（最優先）→ なければ出席状況バッジ */}
                    {isCancel ? (
                      <View style={[styles.attStatusBadge, { backgroundColor: COLORS.gray100 }]}>
                        <Text style={[styles.attStatusText, { color: COLORS.gray500 }]}>休講</Text>
                      </View>
                    ) : isMakeup ? (
                      <View style={[styles.attStatusBadge, { backgroundColor: COLORS.successLight }]}>
                        <Text style={[styles.attStatusText, { color: COLORS.success }]}>補講</Text>
                      </View>
                    ) : currentStatus ? (
                      <View style={[styles.attStatusBadge, { backgroundColor: ATT_CONFIG[currentStatus].bg }]}>
                        <Text style={[styles.attStatusText, { color: ATT_CONFIG[currentStatus].color }]}>
                          {ATT_CONFIG[currentStatus].label}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* 操作ボタン行: 出席 / 欠席 / 休講 */}
                  <View style={styles.attBtnRow}>
                    {ATT_BUTTONS.map(btn => {
                      const isActive =
                        btn.key === 'cancel' ? isCancel : !isCancel && currentStatus === btn.key;
                      const onPress = async () => {
                        if (btn.key === 'cancel') {
                          // 休講にする場合、その日の出欠記録は消す
                          if (currentStatus) await deleteRecord(s.id, todayStr);
                          await toggleCancel(s.id);
                        } else {
                          // 出席/欠席にする場合、休講が付いていたら解除する
                          if (isCancel) await toggleCancel(s.id);
                          recordAttendance(s.id, todayStr, btn.key);
                        }
                      };
                      return (
                        <TouchableOpacity
                          key={btn.key}
                          style={[
                            styles.attBtn,
                            { borderColor: btn.color },
                            isActive && { backgroundColor: btn.color },
                          ]}
                          onPress={onPress}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.attBtnText, { color: isActive ? '#fff' : btn.color }]}>
                            {btn.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── 今日の締切（完了ボタン付き） ── */}
        {todayDeadlines.length > 0 && (
          <View style={[styles.card, styles.deadlineCard]}>
            <SectionHeader title="今日の締切" />
            {todayDeadlines.map(e => {
              const cfg = EVENT_CONFIG[e.event_type];
              return (
                <View key={e.id} style={[styles.eventRow, { borderLeftColor: cfg.color }]}>
                  <Ionicons name={cfg.icon as any} size={16} color={cfg.color} style={styles.eventIcon} />
                  <View style={styles.eventBody}>
                    <Text style={styles.eventTitle}>{e.title}</Text>
                    <Text style={[styles.eventMeta, { color: COLORS.amber }]}>
                      {e.start_time ? `${e.start_time} 締切` : '今日締切'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.completeBtn}
                    onPress={() => toggleDone(e.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.completeBtnText}>✓ 完了</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* ── 近い締切・テスト（明日以降） ── */}
        {upcomingDeadlines.length > 0 && (
          <View style={styles.card}>
            <SectionHeader title="近い締切・テスト" />
            {upcomingDeadlines.slice(0, 5).map(e => {
              const cfg  = EVENT_CONFIG[e.event_type];
              const diff = Math.ceil(
                (new Date(e.start_date).getTime() - new Date(todayStr).getTime()) / 86400000,
              );
              const isUrgent = diff <= 2;
              return (
                <View key={e.id} style={[styles.eventRow, { borderLeftColor: cfg.color }]}>
                  <Ionicons name={cfg.icon as any} size={16} color={cfg.color} style={styles.eventIcon} />
                  <View style={styles.eventBody}>
                    <Text style={styles.eventTitle}>{e.title}</Text>
                    <Text style={styles.eventMeta}>{e.start_date}</Text>
                  </View>
                  <View style={[
                    styles.countdownBadge,
                    { backgroundColor: isUrgent ? COLORS.dangerLight : COLORS.warningLight },
                  ]}>
                    <Text style={[
                      styles.countdownText,
                      { color: isUrgent ? COLORS.danger : COLORS.warning },
                    ]}>
                      {`${diff}日後`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── 今月の収支 ── */}
        <View style={styles.card}>
          <SectionHeader title="今月の収支" />
          <View style={styles.moneyGrid}>
            <MoneyCell label="収入"     value={monthIncome} color={COLORS.success} prefix="¥" />
            <MoneyCell label="支出"     value={monthExp}    color={COLORS.danger}  prefix="¥" />
            <MoneyCell label="サブスク" value={subTotal}    color={COLORS.warning} prefix="¥" />
            <MoneyCell
              label="残高"
              value={Math.abs(monthBalance)}
              color={monthBalance >= 0 ? COLORS.success : COLORS.danger}
              prefix={monthBalance >= 0 ? '+¥' : '-¥'}
            />
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// 共通サブコンポーネント
// ─────────────────────────────────────────────────────────────

/** セクションヘッダー：日本語タイトルを自然に表示 */
function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

/** 収支セル */
function MoneyCell({ label, value, color, prefix }: {
  label: string; value: number; color: string; prefix: string;
}) {
  return (
    <View style={styles.moneyCell}>
      <View style={[styles.moneyCellDot, { backgroundColor: color + '28' }]}>
        <Text style={[styles.moneyCellLabel, { color }]}>{label}</Text>
      </View>
      <Text style={[styles.moneyCellValue, { color }]}>
        {prefix}{value.toLocaleString()}
      </Text>
    </View>
  );
}


// ─────────────────────────────────────────────────────────────
// メインスタイル
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.gray50 },
  scrollContent: { paddingBottom: SPACING.xl + SPACING.sm },

  // ── グリーティング ──────────────────────────────────────────
  greeting: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  greetingText: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.gray900,
    letterSpacing: -0.5,
  },
  userNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
  },
  dateText: {
    fontSize: 13,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
    fontWeight: '500',
  },

  // ── カレンダー ─────────────────────────────────────────────
  calCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.sm + 4,
    overflow: 'hidden',
    ...SHADOW.sm,
  },

  // ── 汎用カード ─────────────────────────────────────────────
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm + 4,
    ...SHADOW.sm,
  },

  // ── セクションタイトル（uppercase 廃止・日本語自然表示） ───
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: SPACING.sm + 4,
  },

  emptyText: {
    fontSize: 14,
    color: COLORS.gray400,
    textAlign: 'center',
    paddingVertical: SPACING.sm,
  },

  // ── イベント行 ────────────────────────────────────────────
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderLeftWidth: 3,
    paddingLeft: SPACING.sm + 2,
    marginBottom: SPACING.xs,
    borderRadius: 2,
    gap: SPACING.sm,
  },
  eventIcon: { width: 20, textAlign: 'center' },
  eventBody:  { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  eventMeta:  { fontSize: 13, color: COLORS.gray400, marginTop: 2 },
  doneText:   { textDecorationLine: 'line-through', color: COLORS.gray400 },
  cancelledText: { textDecorationLine: 'line-through', color: COLORS.gray400 },
  typeBadge:  { borderRadius: RADIUS.sm, paddingHorizontal: 7, paddingVertical: 3 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },

  // ── 今日の授業 ────────────────────────────────────────────
  slotCard: {
    marginBottom: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gray50,
    paddingBottom: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    overflow: 'hidden',
  },
  attStatusBadge: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  attStatusText: { fontSize: 12, fontWeight: '700' },
  attBtnRow: {
    flexDirection: 'row',
    gap: SPACING.sm - 2,
    paddingHorizontal: SPACING.sm + 2,
    paddingTop: SPACING.sm,
  },
  attBtn: {
    flex: 1,
    // paddingVertical 11 → 合計タップ高さ ≈ 44px
    paddingVertical: 11,
    borderRadius: RADIUS.sm + 2,
    borderWidth: 1.5,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  attBtnText: { fontSize: 13, fontWeight: '700' },

  // ── 今日の締切 ────────────────────────────────────────────
  // 赤ではなくアンバー（温かみのある警告色）で柔らかく
  deadlineCard: {
    backgroundColor: COLORS.amberLight,
    borderWidth: 1,
    borderColor: COLORS.amberBorder,
  },
  completeBtn: {
    backgroundColor: COLORS.success,
    borderRadius: RADIUS.sm + 2,
    paddingHorizontal: SPACING.sm + 4,
    paddingVertical: 9,
  },
  completeBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // ── 近い締切 ──────────────────────────────────────────────
  countdownBadge: {
    borderRadius: RADIUS.sm + 2,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
  },
  countdownText: { fontSize: 12, fontWeight: '700' },

  // ── 次のシフト ────────────────────────────────────────────
  nextShiftCard: {
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  nextShiftBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 3,
  },
  nextShiftBadgeText: { fontSize: 12, fontWeight: '700' },

  // ── 収支グリッド ──────────────────────────────────────────
  moneyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm + 2,
  },
  moneyCell: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  moneyCellDot: {
    alignSelf: 'flex-start',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 3,
    marginBottom: SPACING.xs + 2,
  },
  moneyCellLabel: { fontSize: 11, fontWeight: '700' },
  moneyCellValue: { fontSize: 20, fontWeight: '800' },
});
