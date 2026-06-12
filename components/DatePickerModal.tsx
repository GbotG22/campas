/**
 * DatePickerModal
 * - 既存の MonthCalendar を再利用したカレンダーピッカー
 * - 外部ライブラリ不要、Expo Go で動作
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';
import MonthCalendar from '@/components/MonthCalendar';
import { todayYMD } from '@/lib/dateUtils';

interface Props {
  visible:   boolean;
  /** YYYY-MM-DD */
  value:     string;
  onConfirm: (date: string) => void;
  onCancel:  () => void;
  title?:    string;
  /** 最小日付 YYYY-MM-DD（省略可） */
  minDate?:  string;
  /** 最大日付 YYYY-MM-DD（省略可） */
  maxDate?:  string;
}

const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];
const MONTH_JA = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function formatDate(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEK_JA[d.getDay()]}）`;
}

export default function DatePickerModal({ visible, value, onConfirm, onCancel, title, minDate, maxDate }: Props) {
  const today = new Date();

  // モーダルが開いたとき、value の月を初期表示
  const parseYM = (v: string) => {
    if (v && /^\d{4}-\d{2}/.test(v)) {
      return { year: parseInt(v.slice(0, 4)), month: parseInt(v.slice(5, 7)) };
    }
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  };

  const initial   = parseYM(value);
  const [year,    setYear]    = useState(initial.year);
  const [month,   setMonth]   = useState(initial.month);
  const [selected, setSelected] = useState(value || todayYMD());

  // visible になるたびに value に合わせてリセット
  useEffect(() => {
    if (visible) {
      const ym = parseYM(value);
      setYear(ym.year);
      setMonth(ym.month);
      setSelected(value || todayYMD());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function handleSelect(date: string) {
    if (minDate && date < minDate) return;
    if (maxDate && date > maxDate) return;
    setSelected(date);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        {/* ── ヘッダー ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title ?? '日付を選択'}</Text>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => onConfirm(selected)}
          >
            <Text style={styles.confirmText}>確定</Text>
          </TouchableOpacity>
        </View>

        {/* ── カレンダー ── */}
        <View style={styles.calendarWrap}>
          <MonthCalendar
            year={year}
            month={month}
            selectedDate={selected}
            onSelectDate={handleSelect}
            markers={[]}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
          />
        </View>

        {/* ── 選択日表示 ── */}
        <View style={styles.selectedBar}>
          <Text style={styles.selectedLabel}>選択中</Text>
          <Text style={styles.selectedDate}>{formatDate(selected)}</Text>
        </View>

        {/* ── 今日ボタン ── */}
        <TouchableOpacity
          style={styles.todayBtn}
          onPress={() => {
            const t = todayYMD();
            const ym = parseYM(t);
            setYear(ym.year);
            setMonth(ym.month);
            setSelected(t);
          }}
        >
          <Text style={styles.todayBtnText}>今日</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray100,
  },
  headerBtn:   { minWidth: 72 },
  title:       { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  cancelText:  { fontSize: 16, color: COLORS.gray600 },
  confirmText: { fontSize: 16, fontWeight: '700', color: COLORS.primary, textAlign: 'right' },

  calendarWrap: {
    marginHorizontal: 8, marginTop: 8,
    backgroundColor: COLORS.white,
    borderRadius: 16, overflow: 'hidden',
  },

  selectedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: COLORS.primaryLight, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  selectedLabel: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  selectedDate:  { fontSize: 14, fontWeight: '800', color: COLORS.primary },

  todayBtn: {
    marginHorizontal: 16, marginTop: 12,
    borderWidth: 1.5, borderColor: COLORS.primary,
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  todayBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
});
