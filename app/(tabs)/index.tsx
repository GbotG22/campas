import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS, SPACING, RADIUS, SHADOW, DAY_LABELS } from '@/constants/theme';
import MonthCalendar, { CalendarMarker } from '@/components/MonthCalendar';
import { useAuthStore }        from '@/stores/auth.store';
import { useSubscriptions }    from '@/hooks/useSubscriptions';
import { useEvents, EVENT_CONFIG }   from '@/hooks/useEvents';
import { useShifts }           from '@/hooks/useShifts';
import { useIncomes }          from '@/hooks/useIncomes';
import { useTimetable }        from '@/hooks/useTimetable';
import { useExpenses }         from '@/hooks/useExpenses';
import { useAttendance, ATT_CONFIG } from '@/hooks/useAttendance';
import type { AttendanceStatus } from '@/hooks/useAttendance';
import { useNativeCalendar } from '@/hooks/useNativeCalendar';
import type { Database }       from '@/types/database';

type TimetableSlot = Database['public']['Tables']['timetable_slots']['Row'];

const today    = new Date();
const todayStr = today.toISOString().split('T')[0];
const todayDow = (() => { const d = today.getDay(); return d === 0 || d === 6 ? -1 : d - 1; })();

function getYM(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function fmt(d: Date)   { return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }

const ATT_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent'];

export default function HomeScreen() {
  const { user }  = useAuthStore();
  const { monthlyTotal: subTotal }                          = useSubscriptions();
  const { events, getForDate: getEvents, getUpcoming, toggleDone } = useEvents();
  const { shifts, getForDate: getShifts, getNextShift }      = useShifts();
  const { getMonthlyTotal }                                 = useIncomes();
  const { slots }                                           = useTimetable();
  const { expenses }                                        = useExpenses();
  const { record: recordAttendance, getForDate: getAttendance } = useAttendance();
  const { nativeEvents, isConnected: nativeConnected } = useNativeCalendar();

  const hour     = today.getHours();
  const greeting = hour < 10 ? 'おはようございます ☀️' : hour < 18 ? 'こんにちは 👋' : 'お疲れ様です 🌙';

  // メールアドレスの @ 前をユーザー名として使用（例: kazuki@gmail.com → kazuki）
  const userName = user?.email?.split('@')[0] ?? '';

  // ── カレンダー月制御 ──────────────────────────────────────
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const [selDate,  setSelDate]  = useState<string>(todayStr);

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
  }, [slots]);

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
    if (selDate === tm.toISOString().split('T')[0]) return '明日';
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
              <Text style={styles.eventEmoji}>💼</Text>
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
              <Text style={styles.eventEmoji}>💼</Text>
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
                <Text style={styles.eventEmoji}>{cfg.emoji}</Text>
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
              <Text style={styles.eventEmoji}>📱</Text>
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
              return (
                <View key={s.id} style={styles.slotCard}>
                  {/* 授業情報 */}
                  <View style={[styles.eventRow, { borderLeftColor: s.color ?? COLORS.primary, marginBottom: 0 }]}>
                    <Text style={styles.eventEmoji}>📅</Text>
                    <View style={styles.eventBody}>
                      <Text style={styles.eventTitle}>{s.subject_name}</Text>
                      <Text style={styles.eventMeta}>
                        {s.period}限{s.room ? `　📍${s.room}` : ''}
                      </Text>
                    </View>
                    {/* 出席状況バッジ */}
                    {currentStatus && (
                      <View style={[styles.attStatusBadge, { backgroundColor: ATT_CONFIG[currentStatus].bg }]}>
                        <Text style={[styles.attStatusText, { color: ATT_CONFIG[currentStatus].color }]}>
                          {ATT_CONFIG[currentStatus].label}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* 出席ボタン行 */}
                  <View style={styles.attBtnRow}>
                    {ATT_STATUSES.map(status => {
                      const cfg      = ATT_CONFIG[status];
                      const isActive = currentStatus === status;
                      return (
                        <TouchableOpacity
                          key={status}
                          style={[
                            styles.attBtn,
                            { borderColor: cfg.color },
                            isActive && { backgroundColor: cfg.color },
                          ]}
                          onPress={() => recordAttendance(s.id, todayStr, status)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.attBtnText, { color: isActive ? '#fff' : cfg.color }]}>
                            {cfg.label}
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
            <SectionHeader title="今日の締切 🔥" />
            {todayDeadlines.map(e => {
              const cfg = EVENT_CONFIG[e.event_type];
              return (
                <View key={e.id} style={[styles.eventRow, { borderLeftColor: cfg.color }]}>
                  <Text style={styles.eventEmoji}>{cfg.emoji}</Text>
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
                  <Text style={styles.eventEmoji}>{cfg.emoji}</Text>
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
  eventEmoji: { fontSize: 16 },
  eventBody:  { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  eventMeta:  { fontSize: 12, color: COLORS.gray400, marginTop: 2 },
  doneText:   { textDecorationLine: 'line-through', color: COLORS.gray400 },
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
