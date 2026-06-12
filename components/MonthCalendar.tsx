import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT } from '@/constants/theme';
import { todayYMD } from '@/lib/dateUtils';

export interface CalendarMarker {
  date:  string;   // YYYY-MM-DD
  color: string;
}

interface Props {
  year:           number;
  month:          number;   // 1〜12
  selectedDate:   string | null;
  onSelectDate:   (date: string) => void;
  markers:        CalendarMarker[];
  onPrevMonth:    () => void;
  onNextMonth:    () => void;
}

const WEEK_HEADERS = ['月', '火', '水', '木', '金', '土', '日'];
const MONTH_NAMES  = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

export default function MonthCalendar({ year, month, selectedDate, onSelectDate, markers, onPrevMonth, onNextMonth }: Props) {

  // 描画ごとに評価（モジュールレベル定数だと起動時刻で凍結＆UTCずれするため）
  const TODAY = todayYMD();

  // ── セル幅を実測幅から算出（親の余白に依存せず画面幅いっぱいに広げる）──
  const [gridW, setGridW] = useState(0);
  const onGridLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - gridW) > 0.5) setGridW(w);
  };
  // weekRow の左右 paddingHorizontal(4×2=8) を差し引いて 7 等分
  const cellSize  = gridW > 0 ? (gridW - 8) / 7 : FALLBACK_CELL;
  // 日付の丸は正方形セル内に収め、上限を設けて大きくなりすぎないように
  const circle    = Math.min(Math.round(cellSize * 0.74), 38);

  // ── カレンダーグリッドを構築 ─────────────────────────────
  const { weeks, daysInMonth } = useMemo(() => {
    const firstDow = new Date(year, month - 1, 1).getDay(); // 0=日
    const pad      = firstDow === 0 ? 6 : firstDow - 1;    // 月始まりに変換
    const days     = new Date(year, month, 0).getDate();

    const cells: (number | null)[] = [
      ...Array(pad).fill(null),
      ...Array.from({ length: days }, (_, i) => i + 1),
    ];
    // 7の倍数になるよう後ろを null 埋め
    while (cells.length % 7 !== 0) cells.push(null);

    const wks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) wks.push(cells.slice(i, i + 7));
    return { weeks: wks, daysInMonth: days };
  }, [year, month]);

  // ── 日付ごとのドット集約（最大3色） ─────────────────────
  const markerMap = useMemo(() => {
    const map = new Map<string, string[]>();
    markers.forEach(m => {
      const arr = map.get(m.date) ?? [];
      if (!arr.includes(m.color) && arr.length < 3) arr.push(m.color);
      map.set(m.date, arr);
    });
    return map;
  }, [markers]);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  return (
    <View style={styles.container} onLayout={onGridLayout}>

      {/* ── 月ナビゲーション ── */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={onPrevMonth} style={styles.navBtn}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>{year}年 {MONTH_NAMES[month - 1]}</Text>
        <TouchableOpacity onPress={onNextMonth} style={styles.navBtn}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── 曜日ヘッダー ── */}
      <View style={styles.weekRow}>
        {WEEK_HEADERS.map((d, i) => (
          <Text
            key={d}
            style={[
              styles.weekHeader,
              { width: cellSize },
              i === 5 && styles.satHeader,
              i === 6 && styles.sunHeader,
            ]}
          >{d}</Text>
        ))}
      </View>

      {/* ── 日付グリッド ── */}
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={[styles.dayCell, { width: cellSize }]} />;

            const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
            const isToday    = dateStr === TODAY;
            const isSelected = dateStr === selectedDate;
            const dots       = markerMap.get(dateStr) ?? [];
            const isSat      = di === 5;
            const isSun      = di === 6;

            return (
              <TouchableOpacity
                key={di}
                style={[styles.dayCell, { width: cellSize }]}
                onPress={() => onSelectDate(dateStr)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.dayNum,
                  { width: circle, height: circle, borderRadius: circle / 2 },
                  isToday    && styles.todayCircle,
                  isSelected && !isToday && styles.selectedCircle,
                ]}>
                  <Text style={[
                    styles.dayText,
                    isToday    && styles.todayText,
                    isSelected && !isToday && styles.selectedText,
                    isSat && !isToday && !isSelected && styles.satText,
                    isSun && !isToday && !isSelected && styles.sunText,
                  ]}>{day}</Text>
                </View>

                {/* ドット */}
                {dots.length > 0 && (
                  <View style={styles.dotRow}>
                    {dots.map((c, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: c }]} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// 実測幅が取れるまでの初期フォールバック（次フレームで実測値に置換される）
const FALLBACK_CELL = 44;

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.white, paddingBottom: 4 },

  // ナビ
  nav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 10 },
  navBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 24, color: COLORS.primary, fontWeight: '700' },
  navTitle: { fontSize: FONT.subhead, fontWeight: '800', color: COLORS.gray900 },

  // 曜日・週
  weekRow:    { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 4 },
  weekHeader: { textAlign: 'center', fontSize: FONT.caption, fontWeight: '700', color: COLORS.gray400, paddingVertical: 4 },
  satHeader:  { color: '#3B82F6' },
  sunHeader:  { color: '#EF4444' },

  // 日付セル（width / 丸サイズは描画時にインライン指定）
  dayCell: { alignItems: 'center', paddingVertical: 3 },
  dayNum:  { alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: FONT.body, color: COLORS.gray900, fontWeight: '500' },

  todayCircle:   { backgroundColor: COLORS.primary },
  todayText:     { color: '#fff', fontWeight: '800' },
  selectedCircle:{ backgroundColor: COLORS.primaryLight, borderWidth: 1.5, borderColor: COLORS.primary },
  selectedText:  { color: COLORS.primary, fontWeight: '700' },
  satText:       { color: '#3B82F6' },
  sunText:       { color: '#EF4444' },

  // ドット
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 1 },
  dot:    { width: 5, height: 5, borderRadius: 2.5 },
});
