/**
 * useAI — Anthropic Claude API を使った予定分析フック
 * ─────────────────────────────────────────────────────────────────────
 * ■ Expo Go 完全対応
 *   fetch のみ使用。ネイティブモジュール不要。
 *
 * ■ セットアップ
 *   1. https://console.anthropic.com でAPIキーを発行
 *   2. .env.local に以下を追加:
 *      EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
 *
 * ■ セキュリティ注意
 *   EXPO_PUBLIC_ 変数はアプリバンドルに含まれます。
 *   個人利用・開発用途であれば問題ありませんが、
 *   公開アプリ化する場合はバックエンドプロキシ経由に変更してください。
 *
 * ■ 使い方
 *   const { isAnalyzing, advice, error, analyze, clear } = useAI();
 *   await analyze(scheduleItems);
 * ─────────────────────────────────────────────────────────────────────
 */
import { useCallback, useState } from 'react';

// ── 型定義 ──────────────────────────────────────────────────────────
/** useAI に渡す簡易予定データ */
export interface AIScheduleItem {
  title:    string;
  /** 日本語ラベル（例: '課題', 'バイト', 'テスト'） */
  typeLabel: string;
  date:     string;         // YYYY-MM-DD
  time?:    string | null;  // HH:MM
  endTime?: string | null;  // HH:MM
  isDone:   boolean;
}

// ── 定数 ────────────────────────────────────────────────────────────
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-haiku-4-5-20251001'; // 最新・低コスト・高速
const MAX_TOKENS    = 400;

// ── プロンプト生成 ───────────────────────────────────────────────────
const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getMonth() + 1}/${dt.getDate()}(${WEEK_JA[dt.getDay()]})`;
}

function buildPrompt(items: AIScheduleItem[], today: string): string {
  // 今日以降14日間に絞る
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 14);
  const limitStr = limit.toISOString().split('T')[0];

  const upcoming = items
    .filter(i => !i.isDone && i.date >= today && i.date <= limitStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = items
    .filter(i => !i.isDone && i.date < today)
    .slice(-3); // 最近の未完了3件のみ

  let scheduleText = '';

  if (past.length > 0) {
    scheduleText += '【期限切れ・未完了】\n';
    past.forEach(i => {
      scheduleText += `  ${fmtDate(i.date)} ${i.typeLabel}「${i.title}」\n`;
    });
    scheduleText += '\n';
  }

  if (upcoming.length === 0) {
    scheduleText += '（今後14日間の予定はありません）\n';
  } else {
    scheduleText += '【今後14日間の予定】\n';
    upcoming.forEach(i => {
      const time = i.time
        ? ` ${i.time}${i.endTime ? `〜${i.endTime}` : ''}`
        : '';
      scheduleText += `  ${fmtDate(i.date)}${time} ${i.typeLabel}「${i.title}」\n`;
    });
  }

  return `あなたは大学生の予定管理アシスタントです。
今日は${fmtDate(today)}です。

${scheduleText}
上記の予定を見て、この大学生へのアドバイスを日本語で200〜250文字で書いてください。
以下の点に触れてください：
- 直近で注意すべき締め切りや予定
- バイトと学業のバランス（バイトがあれば）
- 今日・明日やっておくと良いこと
絵文字を適度に使って、読みやすくしてください。`;
}

// ── フック ────────────────────────────────────────────────────────
export function useAI() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [advice,      setAdvice]      = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const analyze = useCallback(async (items: AIScheduleItem[]) => {
    const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

    if (!apiKey) {
      setError(
        'APIキーが未設定です。\n' +
        '.env.local に EXPO_PUBLIC_ANTHROPIC_API_KEY を追加して\n' +
        'npx expo start -c で再起動してください。'
      );
      return;
    }

    setIsAnalyzing(true);
    setAdvice(null);
    setError(null);

    const today = new Date().toISOString().split('T')[0];

    try {
      const res = await fetch(ANTHROPIC_API, {
        method:  'POST',
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{
            role:    'user',
            content: buildPrompt(items, today),
          }],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // 401: APIキー不正 / 429: レート制限 / 529: 過負荷
        const hint =
          res.status === 401 ? '（APIキーを確認してください）' :
          res.status === 429 ? '（しばらく待ってから再試行してください）' :
          res.status === 529 ? '（Claudeサーバーが混雑しています。少し待ってください）' :
          '';
        throw new Error(`Anthropic API ${res.status} ${hint}: ${body.slice(0, 100)}`);
      }

      const data: {
        content: Array<{ type: string; text: string }>;
      } = await res.json();

      const text = data.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');

      setAdvice(text || '（アドバイスを取得できませんでした）');
    } catch (e: any) {
      setError(e?.message ?? 'AI分析中にエラーが発生しました');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const clear = useCallback(() => {
    setAdvice(null);
    setError(null);
  }, []);

  return {
    /** AI分析中か */
    isAnalyzing,
    /** AIからのアドバイステキスト（未取得なら null） */
    advice,
    /** エラーメッセージ（なければ null） */
    error,
    /** 予定を分析してアドバイスを取得 */
    analyze,
    /** 結果をクリア */
    clear,
  };
}
