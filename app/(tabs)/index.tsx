import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS, DAY_LABELS } from '@/constants/theme';
import MonthCalendar, { CalendarMarker } from '@/components/MonthCalendar';
import { useAuthStore }        from '@/stores/auth.store';
import { useSubscriptions }    from '@/hooks/useSubscriptions';
import { useEvents, EVENT_CONFIG }   from '@/hooks/useEvents';
import { useShifts }           from '@/hooks/useShifts';
import { useIncomes }          from '@/hooks/useIncomes';
import { useTimetable }        from '@/hooks/useTimetable';
import { useExpenses }         from '@/hooks/useExpenses';
import { supabase }            from '@/lib/supabase';
import type { Database }       from '@/types/database';

type TimetableSlot = Database['public']['Tables']['timetable_slots']['Row'];

const today     = new Date();
const todayStr  = today.toISOString().split('T')[0];
const todayDow  = (() => { const d = today.getDay(); return d === 0 || d === 6 ? -1 : d - 1; })();

function getYM(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function fmt(d: Date)   { return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { monthlyTotal: subTotal, subscriptions } = useSubscriptions();
  const { events, getForDate: getEvents, getUpcoming } = useEvents();
  const { shifts, getForDate: getShifts }              = useShifts();
  const { incomes, getMonthlyTotal }                   = useIncomes();
  const { slots }                                      = useTimetable();
  const { expenses }                                   = useExpenses();

  const hour     = today.getHours();
  const greeting = hour < 10 ? 'おはようございます ☀️' : hour < 18 ? 'こんにちは 👋' : 'お疲れ様です 🌙';

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
    // events
    events.forEach(e => out.push({ date: e.start_date, color: EVENT_CONFIG[e.event_type].color }));
    // shifts
    shifts.forEach(s => out.push({ date: s.date, color: '#10B981' }));
    return out;
  }, [events, shifts]);

  // ── 選択日のデータ ────────────────────────────────────────
  const selEvents = getEvents(selDate);
  const selShifts = getShifts(selDate);

  // ── 今日の時間割 ─────────────────────────────────────────
  const todaySlots = useMemo(() => {
    if (todayDow < 0) return [];
    const now = today.getHours() * 60 + today.getMinutes();
    return slots
      .filter(s => s.day_of_week === todayDow)
      .sort((a, b) => a.period - b.period);
  }, [slots]);

  // ── 近い締切 ─────────────────────────────────────────────
  const upcoming = getUpcoming(7);

  // ── 今月の収支 ────────────────────────────────────────────
  const thisYM     = getYM(today);
  const monthIncome = getMonthlyTotal(thisYM);
  const monthExp   = useMemo(
    () => expenses.filter(e => e.paid_at?.startsWith(thisYM)).reduce((s, e) => s + e.amount, 0),
    [expenses, thisYM],
  );
  const monthBalance = monthIncome - monthExp - subTotal;

  // ── 選択日ラベル ─────────────────────────────────────────
  const selLabel = useMemo(() => {
    if (selDate === todayStr) return '今日';
    const tm = new Date(today); tm.setDate(tm.getDate() + 1);
    if (selDate === tm.toISOString().split('T')[0]) return '明日';
    const d = new Date(selDate);
    return fmt(d);
  }, [selDate]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── グリーティング ── */}
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>{greeting}</Text>
          <Text style={styles.dateText}>{fmt(today)}（{['日','月','火','水','木','金','土'][today.getDay()]}）</Text>
        </View>

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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{selLabel}の予定</Text>
          {selEvents.length === 0 && selShifts.length === 0 && (
            <Text style={styles.emptyText}>予定はありません</Text>
          )}
          {selShifts.map(s => (
            <View key={s.id} style={[styles.eventRow, { borderLeftColor: s.workplace?.color ?? '#10B981' }]}>
              <Text style={styles.eventEmoji}>💼</Text>
              <View style={styles.eventBody}>
                <Text style={styles.eventTitle}>{s.workplace?.name ?? 'バイト'}</Text>
                <Text style={styles.eventMeta}>{s.start_time} 〜 {s.end_time}  ¥{(s.estimated_wage ?? 0).toLocaleString()}</Text>
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
                  {e.start_time && <Text style={styles.eventMeta}>{e.start_time}{e.end_time ? ` 〜 ${e.end_time}` : ''}</Text>}
                </View>
                <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── 今日の授業 ── */}
        {todaySlots.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>今日の授業</Text>
            {todaySlots.map(s => (
              <View key={s.id} style={[styles.eventRow, { borderLeftColor: s.color ?? COLORS.primary }]}>
                <Text style={styles.eventEmoji}>📅</Text>
                <View style={styles.eventBody}>
                  <Text style={styles.eventTitle}>{s.subject_name}</Text>
                  <Text style={styles.eventMeta}>{s.period}限  {s.room ? `📍${s.room}` : ''}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── 近い締切 ── */}
        {upcoming.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>近い締切・テスト</Text>
            {upcoming.slice(0, 5).map(e => {
              const cfg  = EVENT_CONFIG[e.event_type];
              const diff = Math.ceil((new Date(e.start_date).getTime() - today.setHours(0,0,0,0)) / 86400000);
              return (
                <View key={e.id} style={[styles.eventRow, { borderLeftColor: cfg.color }]}>
                  <Text style={styles.eventEmoji}>{cfg.emoji}</Text>
                  <View style={styles.eventBody}>
                    <Text style={styles.eventTitle}>{e.title}</Text>
                    <Text style={styles.eventMeta}>{e.start_date}</Text>
                  </View>
                  <View style={[styles.countdownBadge, { backgroundColor: diff <= 2 ? COLORS.dangerLight : COLORS.warningLight }]}>
                    <Text style={[styles.countdownText, { color: diff <= 2 ? COLORS.danger : COLORS.warning }]}>
                      {diff === 0 ? '今日' : `${diff}日後`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── 今月の収支 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>今月の収支（{calYear}年{calMonth}月）</Text>
          <View style={styles.moneyGrid}>
            <MoneyCell label="収入"       value={monthIncome} color={COLORS.success} prefix="¥" />
            <MoneyCell label="支出"       value={monthExp}    color={COLORS.danger}  prefix="¥" />
            <MoneyCell label="サブスク"   value={subTotal}    color={COLORS.warning} prefix="¥" />
            <MoneyCell
              label="残高"
              value={Math.abs(monthBalance)}
              color={monthBalance >= 0 ? COLORS.success : COLORS.danger}
              prefix={monthBalance >= 0 ? '+¥' : '-¥'}
            />
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MoneyCell({ label, value, color, prefix }: {
  label: string; value: number; color: string; prefix: string;
}) {
  return (
    <View style={styles.moneyCell}>
      <Text style={styles.moneyCellLabel}>{label}</Text>
      <Text style={[styles.moneyCellValue, { color }]}>{prefix}{value.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },

  greeting:     { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  greetingText: { fontSize: 18, fontWeight: '800', color: COLORS.gray900 },
  dateText:     { fontSize: 12, color: COLORS.gray400, marginTop: 2 },

  calCard: { backgroundColor: COLORS.white, marginHorizontal: 12, borderRadius: 16, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },

  section:      { backgroundColor: COLORS.white, marginHorizontal: 12, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.gray600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyText:    { fontSize: 13, color: COLORS.gray400, textAlign: 'center', paddingVertical: 8 },

  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderLeftWidth: 3, paddingLeft: 10, marginBottom: 4, borderRadius: 2, gap: 8 },
  eventEmoji: { fontSize: 16 },
  eventBody:  { flex: 1 },
  eventTitle: { fontSize: 13, fontWeight: '600', color: COLORS.gray900 },
  eventMeta:  { fontSize: 11, color: COLORS.gray400, marginTop: 1 },
  doneText:   { textDecorationLine: 'line-through', color: COLORS.gray400 },
  typeBadge:  { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },

  countdownBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  countdownText:  { fontSize: 11, fontWeight: '700' },

  moneyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moneyCell: { flex: 1, minWidth: '45%', backgroundColor: COLORS.gray50, borderRadius: 12, padding: 12 },
  moneyCellLabel: { fontSize: 11, color: COLORS.gray400, fontWeight: '600', marginBottom: 4 },
  moneyCellValue: { fontSize: 18, fontWeight: '800' },
});
