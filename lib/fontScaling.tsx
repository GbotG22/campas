/**
 * Dynamic Type（iOSの文字サイズ設定）によるレイアウト崩れ対策。
 *
 * アプリ全体の Text / TextInput に maxFontSizeMultiplier のデフォルト値を与え、
 * OS設定で文字を最大にしても 1.2 倍までに制限する。
 *
 * React 19 では関数コンポーネントの defaultProps が無効化されたため、
 * react-native モジュールの Text / TextInput エクスポート（getter）を
 * デフォルト値付きの薄いラッパーに差し替える方式を取る。
 * Metro は `import { Text } from 'react-native'` を使用箇所でのプロパティ
 * アクセスにコンパイルするため、既存の全画面にそのまま適用される。
 *
 * 各画面で maxFontSizeMultiplier を明示指定した場合はそちらが優先される
 * （ラッパーはデフォルト値を先に置き、受け取った props で上書きするため）。
 *
 * app/_layout.tsx の先頭で `import '@/lib/fontScaling';` すること。
 */
import * as React from 'react';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RN = require('react-native');

const MAX_FONT_SIZE_MULTIPLIER = 1.2;
const PATCHED_FLAG = '__maxFontScalePatched';

function withMaxFontScale(Component: any, displayName: string): any {
  const Wrapped = React.forwardRef<any, any>((props, ref) => (
    <Component maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER} {...props} ref={ref} />
  ));
  Wrapped.displayName = displayName;
  (Wrapped as any)[PATCHED_FLAG] = true;
  return Wrapped;
}

function patch(exportName: 'Text' | 'TextInput') {
  const original = RN[exportName];
  // Fast Refresh 等による二重ラップを防ぐ
  if (!original || original[PATCHED_FLAG]) return;
  const wrapped = withMaxFontScale(original, `${exportName}(maxFontScale)`);
  try {
    Object.defineProperty(RN, exportName, {
      configurable: true,
      enumerable: true,
      get: () => wrapped,
    });
  } catch {
    // defineProperty が失敗した場合は無理に適用しない（従来表示のまま動作）
  }
}

patch('Text');
patch('TextInput');
