/**
 * ローカルタイムゾーンで YYYY-MM-DD を返す。
 *
 * toISOString() は UTC 基準のため、JST（UTC+9）では深夜 0〜9 時に
 * 呼ぶと前日の日付を返してしまう。この関数はその問題を回避する。
 */
export function localYMD(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** 今日の YYYY-MM-DD（ローカルタイム） */
export function todayYMD(): string {
  return localYMD(new Date());
}
