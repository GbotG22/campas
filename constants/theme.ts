export const COLORS = {
  primary: '#4F46E5',
  primaryLight: '#EEF2FF',
  success: '#10B981',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  // amber（今日の締切など警告感を柔らかく表現）
  amber: '#F59E0B',
  amberLight: '#FFFBEB',
  amberBorder: '#FDE68A',
  // グレースケール
  gray50:  '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray900: '#111827',
  white: '#FFFFFF',
} as const;

// ── スペーシング ─────────────────────────────────────────────
export const SPACING = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
} as const;

// ── フォントサイズ ────────────────────────────────────────────
// アプリ全体の文字サイズの基準。本文は body(15)を標準とする。
// 「文字が小さい」フィードバック対応で、最小実用サイズを 12 に引き上げた。
export const FONT = {
  caption: 12, // 補足・キャプション（旧 11 を底上げ）
  small:   13, // 副次情報
  body:    15, // 本文標準
  callout: 16, // やや強調
  subhead: 17, // 小見出し
  title:   20, // 見出し
  large:   26, // 画面タイトル
} as const;

// ── 角丸 ────────────────────────────────────────────────────
export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  full: 999,
} as const;

// ── 影（iOS shadowProps + Android elevation を統合） ────────
export const SHADOW: Record<'sm' | 'md' | 'lg', {
  shadowColor:   string;
  shadowOffset:  { width: number; height: number };
  shadowOpacity: number;
  shadowRadius:  number;
  elevation:     number;
}> = {
  sm: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius:  4,
    elevation:     1,
  },
  md: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius:  8,
    elevation:     2,
  },
  lg: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius:  12,
    elevation:     4,
  },
};

// ── 科目カラーパレット ────────────────────────────────────────
export const SUBJECT_COLORS = [
  '#4F46E5', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
] as const;

export const DAY_LABELS    = ['月', '火', '水', '木', '金'] as const;
export const PERIOD_LABELS = ['1限', '2限', '3限', '4限', '5限'] as const;
