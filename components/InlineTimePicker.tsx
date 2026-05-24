/**
 * InlineTimePicker
 * - Modal 不使用のインライン展開型時刻Picker
 * - 時・分を ▲/▼ ボタンで選択（5分ステップ）
 * - Expo Go 完全対応
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS } from '@/constants/theme';

interface Props {
  /** "HH:MM" または "" */
  value:    string;
  onChange: (time: string) => void;
  label?:   string;
  /** 空値（未設定）を許可し「クリア」ボタンを表示 */
  optional?: boolean;
}

function parse(v: string): { h: number; m: number } {
  if (v && /^\d{1,2}:\d{2}$/.test(v)) {
    const [hh, mm] = v.split(':');
    return { h: parseInt(hh), m: Math.round(parseInt(mm) / 5) * 5 % 60 };
  }
  return { h: 9, m: 0 };
}

function fmt(h: number, m: number) {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

export default function InlineTimePicker({ value, onChange, label, optional }: Props) {
  const [open, setOpen] = useState(false);
  const init = parse(value);
  const [h, setH] = useState(init.h);
  const [m, setM] = useState(init.m);

  // value が外部から変わったときに同期
  useEffect(() => {
    if (value) {
      const p = parse(value);
      setH(p.h); setM(p.m);
    }
  }, [value]);

  function confirm() {
    onChange(fmt(h, m));
    setOpen(false);
  }
  function clear() {
    onChange('');
    setOpen(false);
  }

  // 開いている間は内部値をプレビュー表示
  const display = open && !value ? fmt(h, m) : value;

  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}

      <TouchableOpacity
        style={[styles.trigger, open && styles.triggerOpen]}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.75}
      >
        <Text style={styles.icon}>🕐</Text>
        <Text style={[styles.triggerText, !value && !open && styles.placeholder]}>
          {display || '時刻を選択'}
        </Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.panel}>
          {/* ドラムロール */}
          <View style={styles.drums}>
            {/* 時 */}
            <View style={styles.drum}>
              <TouchableOpacity style={styles.arrow} onPress={() => setH(v => (v+1)%24)}>
                <Text style={styles.arrowText}>▲</Text>
              </TouchableOpacity>
              <Text style={styles.drumVal}>{String(h).padStart(2,'0')}</Text>
              <TouchableOpacity style={styles.arrow} onPress={() => setH(v => (v-1+24)%24)}>
                <Text style={styles.arrowText}>▼</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.colon}>:</Text>

            {/* 分（5分刻み） */}
            <View style={styles.drum}>
              <TouchableOpacity style={styles.arrow} onPress={() => setM(v => (v+5)%60)}>
                <Text style={styles.arrowText}>▲</Text>
              </TouchableOpacity>
              <Text style={styles.drumVal}>{String(m).padStart(2,'0')}</Text>
              <TouchableOpacity style={styles.arrow} onPress={() => setM(v => (v-5+60)%60)}>
                <Text style={styles.arrowText}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ボタン */}
          <View style={styles.actions}>
            {optional && (
              <TouchableOpacity style={[styles.btn, styles.clearBtn]} onPress={clear}>
                <Text style={styles.clearText}>クリア</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.btn, styles.confirmBtn]} onPress={confirm}>
              <Text style={styles.confirmText}>確定</Text>
            </TouchableOpacity>
          </View>
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

  panel: {
    borderWidth: 1.5, borderTopWidth: 0, borderColor: COLORS.primary,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    backgroundColor: COLORS.white,
    paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20,
  },

  drums: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, marginBottom: 18,
  },
  drum:     { alignItems: 'center', gap: 4 },
  arrow:    { paddingHorizontal: 20, paddingVertical: 6 },
  arrowText:{ fontSize: 20, color: COLORS.primary, fontWeight: '700' },
  drumVal:  {
    fontSize: 44, fontWeight: '800', color: COLORS.gray900,
    minWidth: 72, textAlign: 'center',
    borderWidth: 2, borderColor: COLORS.primary,
    borderRadius: 12, paddingVertical: 4,
  },
  colon: { fontSize: 36, fontWeight: '800', color: COLORS.gray600, marginTop: 4 },

  actions:     { flexDirection: 'row', gap: 10 },
  btn:         { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  clearBtn:    { backgroundColor: COLORS.gray100 },
  confirmBtn:  { backgroundColor: COLORS.primary },
  clearText:   { fontSize: 14, fontWeight: '700', color: COLORS.gray600 },
  confirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
