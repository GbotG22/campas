import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface AIScheduleItem {
  title:    string;
  typeLabel: string;
  date:     string;
  time?:    string | null;
  endTime?: string | null;
  isDone:   boolean;
}

const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getMonth() + 1}/${dt.getDate()}(${WEEK_JA[dt.getDay()]})`;
}

function buildPrompt(items: AIScheduleItem[], today: string): string {
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 14);
  const limitStr = limit.toISOString().split('T')[0];

  const upcoming = items
    .filter(i => !i.isDone && i.date >= today && i.date <= limitStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = items
    .filter(i => !i.isDone && i.date < today)
    .slice(-3);

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

export function useAI() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [advice,      setAdvice]      = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const analyze = useCallback(async (items: AIScheduleItem[]) => {
    setIsAnalyzing(true);
    setAdvice(null);
    setError(null);

    const today = new Date().toISOString().split('T')[0];

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-analyze', {
        body: { prompt: buildPrompt(items, today) },
      });

      if (fnError) {
        const msg =
          fnError.message?.includes('429') ? 'しばらく待ってから再試行してください' :
          fnError.message?.includes('529') ? 'Claudeサーバーが混雑しています。少し待ってください' :
          'AI分析中にエラーが発生しました';
        setError(msg);
        return;
      }

      if (data?.error) {
        setError('AI分析中にエラーが発生しました');
        return;
      }

      setAdvice(data?.text || '（アドバイスを取得できませんでした）');
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

  return { isAnalyzing, advice, error, analyze, clear };
}
