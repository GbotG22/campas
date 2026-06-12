/**
 * InlineDatePicker
 * - Modal 不使用のインライン展開型カレンダーPicker
 * - 既存 Modal の中でも安全に動作（ネストModalなし）
 * - Expo Go 完全対応
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import MonthCalendar from '@/components/MonthCalendar';
import { COLORS } from '@/constants/theme';
import { todayYMD } from '@/lib/dateUtils';

interface Props {
  /** YYYY-MM-DD (format='date') or YYYY-MM (format='yearMonth') */
  value:     string;
  onChange:  (v: string) => void;
  label?:    string;
  placeholder?: string;
  /** 「クリア」ボタンを表示 */
  optional?: boolean;
  /** 'yearMonth' のとき YYYY年M月 表示、value は YYYY-MM で受け渡し */
  format?:   'date' | 'yearMonth';
}

const WEEK_JA = ['日','月','火','水','木','金','土'];

function fmtFull(s: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(s + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${WEEK_JA[d.getDay()]}）`;
}
function fmtYM(s: string): string {
  if (!s || !/^\d{4}-\d{2}/.test(s)) return '';
  return `${parseInt(s.slice(0,4))}年${parseInt(s.slice(5,7))}月`;
}

function parseYM(v: string) {
  const t = new Date();
  const src = v || todayYMD();
  if (/^\d{4}-\d{2}/.test(src)) {
    return { year: parseInt(src.slice(0,4)), month: parseInt(src.slice(5,7)) };
  }
  return { year: t.getFullYear(), month: t.getMonth()+1 };
}

export default function InlineDatePicker({
  value, onChange, label, placeholder, optional, format = 'date',
}: Props) {
  const [open, setOpen] = useState(false);

  const calVal = format === 'yearMonth' ? (value ? value+'-01' : '') : value;
  const ym     = parseYM(calVal);
  const [year,  setYear]  = useState(ym.year);
  const [month, setMonth] = useState(ym.month);

  useEffect(() => {
    const next = parseYM(format === 'yearMonth' ? (value ? value+'-01' : '') : value);
    setYear(next.year);
    setMonth(next.month);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function prevMonth() {
    if (month === 1) { setYear(y => y-1); setMonth(12); }
    else              setMonth(m => m-1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y+1); setMonth(1); }
    else               setMonth(m => m+1);
  }

  function handleSelect(date: string) {
    onChange(format === 'yearMonth' ? date.slice(0,7) : date);
    setOpen(false);
  }

  const displayText = value
    ? (format === 'yearMonth' ? fmtYM(value) : fmtFull(value))
    : '';

  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}

      <TouchableOpacity
        style={[styles.trigger, open && styles.triggerOpen]}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.75}
      >
        <Text style={styles.icon}>📅</Text>
        <Text style={[styles.triggerText, !displayText && styles.placeholder]}>
          {displayText || placeholder || '日付を選択'}
        </Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.calendar}>
          <MonthCalendar
            year={year} month={month}
            selectedDate={calVal || null}
            onSelectDate={handleSelect}
            markers={[]}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
          />
          {optional && value ? (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => { onChange(''); setOpen(false); }}
            >
              <Text style={styles.clearText}>× クリア</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.gray600, marginBottom: 6 },

  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: COLORS.primaryLight,
  },
  triggerOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },

  icon:        { fontSize: 16 },
  triggerText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.primary },
  placeholder: { color: COLORS.gray400, fontWeight: '400' },
  chevron:     { fontSize: 11, color: COLORS.primary },

  calendar: {
    borderWidth: 1.5, borderTopWidth: 0,
    borderColor: COLORS.primary,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    overflow: 'hidden', backgroundColor: COLORS.white,
    marginBottom: 0,
  },

  clearBtn:  { paddingVertical: 10, alignItems: 'center' },
  clearText: { fontSize: 13, color: COLORS.gray400 },
});
