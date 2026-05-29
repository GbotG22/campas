/**
 * InlineTimePicker
 * - iPhone標準アラームに近いドラムロール式時刻ピッカー
 * - 下からのボトムシートModal
 * - 「時」「分」の2列Wheelで縦スクロール選択（5分刻み）
 * - 中央選択行がハイライト・大きく表示。前後行は段階的に縮小
 * - 「決定」で確定、「キャンセル」で破棄
 * - Expo Go 完全対応（追加パッケージ不要）
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { COLORS, RADIUS, SHADOW, SPACING } from '@/constants/theme';

// ── Props ─────────────────────────────────────────────────────
interface Props {
  /** "HH:MM" または "" */
  value:    string;
  onChange: (v: string) => void;
  label?:   string;
  /** 空値（未設定）を許可し「クリア」ボタンを表示 */
  optional?: boolean;
}

// ── データ ────────────────────────────────────────────────────
const HOURS:   number[] = Array.from({ length: 24 }, (_, i) => i); // 0〜23
const MINUTES: number[] = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// ── レイアウト定数 ──────────────────────────────────────────────
const ITEM_H   = 52;  // 各行の高さ (px)
const VISIBLE  = 5;   // 表示行数（奇数推奨）
const PICK_H   = ITEM_H * VISIBLE;
const PAD      = ITEM_H * Math.floor(VISIBLE / 2); // 上下padding＝中央行がセンターになる量
// ループ用：50 回繰り返し → 中央ブロック（25周目）から開始
// 時: 24×50=1200件・分: 12×50=600件。端に達するには25周必要で実用上「無限」
const REPEATS  = 50;
const HALF_REP = Math.floor(REPEATS / 2); // 25

// ── ユーティリティ ──────────────────────────────────────────────
function parse(v: string): { h: number; m: number } {
  if (v && /^\d{1,2}:\d{2}$/.test(v)) {
    const [hh, mm] = v.split(':').map(Number);
    return { h: hh, m: Math.round(mm / 5) * 5 % 60 };
  }
  return { h: 9, m: 0 };
}

function fmt(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Wheel 列スタイル（Wheel コンポーネントより先に定義） ─────────
const ws = StyleSheet.create({
  outer: {
    width: 90,
    height: PICK_H,
    overflow: 'hidden',
  },
  // 選択行ハイライト（タッチ不要なので pointerEvents="none"）
  indicator: {
    position: 'absolute',
    top:   PAD,
    left:  0,
    right: 0,
    height: ITEM_H,
    borderTopWidth:    1.5,
    borderBottomWidth: 1.5,
    borderColor:      COLORS.gray200,
    backgroundColor:  COLORS.gray50,
  },
  scroll:  { height: PICK_H },
  content: { paddingTop: PAD, paddingBottom: PAD },
  item:    { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  // 距離に応じてサイズ・色を変化（iOS風の遠近感）
  textFar: { fontSize: 13, color: COLORS.gray200, fontWeight: '300' as const },
  textNear:{ fontSize: 20, color: COLORS.gray400, fontWeight: '400' as const },
  textSel: { fontSize: 28, color: COLORS.gray900, fontWeight: '700' as const },
});

// ── WheelItem：memo 化してスクロール中の再描画を防ぐ ──────────
interface ItemProps {
  val:    number;
  isNear: boolean; // diff === 1（選択行の隣）
  isSel:  boolean; // diff === 0（選択行）
}

const WheelItem = memo(function WheelItem({ val, isNear, isSel }: ItemProps) {
  return (
    <View style={ws.item}>
      <Text style={[ws.textFar, isNear && ws.textNear, isSel && ws.textSel]}>
        {String(val).padStart(2, '0')}
      </Text>
    </View>
  );
});

// ── Wheel 列コンポーネント ─────────────────────────────────────
interface WheelProps {
  data:     number[];
  value:    number;
  onChange: (v: number) => void;
}

// memo 化：InlineTimePicker が再描画されても props が変わらない列は再描画しない
const Wheel = memo(function Wheel({ data, value, onChange }: WheelProps) {
  // loopData は data が不変なので mount 時に一度だけ生成
  const loopData = useMemo(
    () => Array.from({ length: data.length * REPEATS }, (_, i) => data[i % data.length]),
    [data],
  );

  // 初期位置：中央ブロック（HALF_REP 周目）の value の位置
  const initRealIdx = Math.max(0, data.indexOf(value));
  const initLoopIdx = HALF_REP * data.length + initRealIdx;

  // 初期スクロール先を ref に固定（mount-only useEffect と組み合わせて再スクロールを防ぐ）
  const initScrollY  = useRef(initLoopIdx * ITEM_H);
  const ref          = useRef<ScrollView>(null);

  // visIdx：スクロール停止時にだけ更新する（スクロール中は setState しない）
  const [visIdx, setVisIdx] = useState(initLoopIdx);

  // mount 時の一度だけ選択位置へスクロール
  // 依存配列を [] にして、value 変化後の再スクロールジャンプを防ぐ
  useEffect(() => {
    const timer = setTimeout(() => {
      ref.current?.scrollTo({ y: initScrollY.current, animated: false });
    }, 80);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // スクロール停止：実際の値を取り出して親へ通知
  // ※ onScroll / scrollEventThrottle は削除 → スクロール中の setState ゼロ
  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.max(
        0,
        Math.min(Math.round(e.nativeEvent.contentOffset.y / ITEM_H), loopData.length - 1),
      );
      setVisIdx(idx);
      onChange(data[idx % data.length]);
    },
    [data, loopData.length, onChange],
  );

  return (
    <View style={ws.outer}>
      {/* 選択行ハイライト（タッチ透過） */}
      <View pointerEvents="none" style={ws.indicator} />

      <ScrollView
        ref={ref}
        style={ws.scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
        contentContainerStyle={ws.content}
      >
        {loopData.map((item, idx) => {
          const diff = Math.abs(idx - visIdx);
          return (
            <WheelItem
              key={idx}
              val={item}
              isNear={diff <= 1}
              isSel={diff === 0}
            />
          );
        })}
      </ScrollView>
    </View>
  );
});

// ── メインコンポーネント ───────────────────────────────────────
export default function InlineTimePicker({ value, onChange, label, optional }: Props) {
  const [open,  setOpen]  = useState(false);
  const [tempH, setTempH] = useState(9);
  const [tempM, setTempM] = useState(0);

  // モーダルを開く：現在値から時・分を初期化
  const handleOpen = useCallback(() => {
    const { h, m } = parse(value);
    setTempH(h);
    setTempM(m);
    setOpen(true);
  }, [value]);

  // 決定
  const handleConfirm = useCallback(() => {
    onChange(fmt(tempH, tempM));
    setOpen(false);
  }, [tempH, tempM, onChange]);

  // クリア（optional 時のみ）
  const handleClear = useCallback(() => {
    onChange('');
    setOpen(false);
  }, [onChange]);

  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}

      {/* ── トリガーボタン ─────────────────────────────────── */}
      <TouchableOpacity style={styles.trigger} onPress={handleOpen} activeOpacity={0.75}>
        <Text style={styles.icon}>🕐</Text>
        <Text style={[styles.triggerText, !value && styles.placeholder]}>
          {value || '時刻を選択'}
        </Text>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      {/* ── ボトムシートModal ──────────────────────────────── */}
      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          {/* バックドロップ（タップで閉じる） */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />

          {/* シート本体 */}
          <View style={styles.sheet}>
            {/* ドラッグハンドル */}
            <View style={styles.handle} />

            {/* ヘッダー */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label ?? '時刻を選択'}</Text>
            </View>

            {/* ── ピッカー本体 ─────────────────────────────── */}
            <View style={styles.pickerArea}>
              {/* 列ラベル */}
              <View style={styles.colLabels}>
                <Text style={[styles.colLabel, { width: 90 }]}>時</Text>
                <View style={styles.colonGap} />
                <Text style={[styles.colLabel, { width: 90 }]}>分</Text>
              </View>

              {/* Wheel 列（open のときだけ mount → 毎回初期スクロールをリセット） */}
              <View style={styles.wheels}>
                {open && (
                  <>
                    <Wheel data={HOURS}   value={tempH} onChange={setTempH} />
                    <Text style={styles.colon}>:</Text>
                    <Wheel data={MINUTES} value={tempM} onChange={setTempM} />
                  </>
                )}
              </View>
            </View>

            {/* ── アクションボタン ─────────────────────────── */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => setOpen(false)}
              >
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>

              {optional && (
                <TouchableOpacity style={[styles.btn, styles.clearBtn]} onPress={handleClear}>
                  <Text style={styles.clearText}>クリア</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.btn, styles.confirmBtn]} onPress={handleConfirm}>
                <Text style={styles.confirmText}>決定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── スタイル ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrap:  { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.gray600, marginBottom: 6 },

  // トリガーボタン
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: COLORS.primaryLight,
  },
  icon:        { fontSize: 16 },
  triggerText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.primary },
  placeholder: { color: COLORS.gray400, fontWeight: '400' },
  chevron:     { fontSize: 11, color: COLORS.primary },

  // オーバーレイ
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },

  // ボトムシート
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingBottom: 36,
    ...SHADOW.lg,
  },

  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.gray300,
    alignSelf: 'center', marginTop: 12,
  },

  sheetHeader: {
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 14, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray100,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },

  // ピッカーエリア
  pickerArea: {
    alignItems: 'center',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },

  // 列ラベル（「時」「分」）
  colLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  colLabel: {
    textAlign: 'center',
    fontSize: 12, fontWeight: '600', color: COLORS.gray400,
  },
  colonGap: { width: 30 }, // コロン幅分のスペーサー

  // Wheel 並び
  wheels: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colon: {
    width: 30,
    textAlign: 'center',
    fontSize: 30, fontWeight: '800',
    color: COLORS.gray700,
    marginBottom: 4,
  },

  // ボタン
  actions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  btn:        { flex: 1, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center' },
  cancelBtn:  { backgroundColor: COLORS.gray100 },
  clearBtn:   { backgroundColor: COLORS.dangerLight },
  confirmBtn: { backgroundColor: COLORS.primary },
  cancelText: { fontSize: 15, fontWeight: '700', color: COLORS.gray600 },
  clearText:  { fontSize: 15, fontWeight: '700', color: COLORS.danger },
  confirmText:{ fontSize: 15, fontWeight: '700', color: COLORS.white },
});
