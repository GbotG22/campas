// @ts-check
// Node.js 18+ — fetch built-in, zero extra dependencies, no external AI API
'use strict';

const { writeFileSync } = require('fs');
const { join } = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('Missing environment variables:', missing.join(', '));
    process.exit(1);
  }
}

// ── 優先度判定（ルールベース）─────────────────────────────────
const HIGH_KEYWORDS = ['クラッシュ', '消えた', '消失', '保存できない', '保存されない', 'ログインできない', 'ログイン不可', '起動しない', '落ちる', 'フリーズ'];
const MID_KEYWORDS = ['表示崩れ', 'レイアウト', '崩れ', 'おかしい', '遅い', '重い', '使いにくい', '使いづらい', '誤表示', 'ずれ'];
const LOW_KEYWORDS = ['要望', '追加してほしい', 'あったらいい', 'あったら良い', 'デザイン', '文言', '好み', 'できたら'];

/** @param {string} message */
function judgePriority(message) {
  const m = message || '';
  if (HIGH_KEYWORDS.some((k) => m.includes(k))) return '高';
  if (MID_KEYWORDS.some((k) => m.includes(k))) return '中';
  if (LOW_KEYWORDS.some((k) => m.includes(k))) return '低';
  return '中'; // 判定不能はデフォルト中
}

const PRIORITY_EMOJI = { 高: '🔴', 中: '🟡', 低: '🟢' };

/** @param {string} id */
function shortId(id) {
  return id.slice(-8);
}

/** @param {string} iso */
function isWithinDays(iso, days) {
  const t = new Date(iso).getTime();
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

async function fetchFeedback() {
  const url =
    `${SUPABASE_URL}/rest/v1/feedback` +
    `?status=in.(open,in_progress)` +
    `&order=created_at.asc` +
    `&select=id,category,message,status,app_version,reported_in_build,created_at`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * @param {any} fb
 * @param {string} priority
 */
function formatLine(fb, priority) {
  const summary = (fb.message || '').replace(/\n/g, ' ').slice(0, 60);
  const build = fb.reported_in_build != null ? `Build ${fb.reported_in_build}` : 'Build不明';
  const emoji = priority ? `${PRIORITY_EMOJI[priority]} ` : '';
  return `- ${emoji}**[${shortId(fb.id)}]** ${fb.category} — ${summary}（${fb.status} / ${build}）`;
}

/**
 * @param {any[]} list
 * @param {string} now
 */
function buildReport(list, now) {
  const openCount = list.filter((f) => f.status === 'open').length;
  const inProgressCount = list.filter((f) => f.status === 'in_progress').length;

  const withPriority = list.map((f) => ({ ...f, _priority: judgePriority(f.message) }));

  const high = withPriority.filter((f) => f._priority === '高');
  const mid = withPriority.filter((f) => f._priority === '中');
  const low = withPriority.filter((f) => f._priority === '低');

  const byCategory = (cat) => withPriority.filter((f) => f.category === cat);
  const bugs = byCategory('不具合報告');
  const requests = byCategory('改善要望');
  const features = byCategory('新機能の提案');

  // in_progress は resolved 待ち候補
  const resolvedPending = withPriority.filter((f) => f.status === 'in_progress');

  const recent = withPriority.filter((f) => isWithinDays(f.created_at, 7));

  const top3 = high.slice(0, 3);

  const section = (items, p) => (items.length ? items.map((f) => formatLine(f, p)).join('\n') : '（なし）');

  const lines = [];
  lines.push('# Camply フィードバック日次レポート');
  lines.push('');
  lines.push(`**実行日時:** ${now}`);
  lines.push('');
  lines.push('> このレポートはルールベース（キーワード判定）で自動生成されています。AI 分析・外部 API は使用していません。フィードバックの status は変更していません。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## サマリー');
  lines.push('');
  lines.push('| 項目 | 件数 |');
  lines.push('|------|------|');
  lines.push(`| 未対応（open） | ${openCount} 件 |`);
  lines.push(`| 対応中（in_progress） | ${inProgressCount} 件 |`);
  lines.push(`| 合計 | ${list.length} 件 |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 優先度別一覧');
  lines.push('');
  lines.push('優先度の判定基準（キーワード）：');
  lines.push('- 🔴 高：クラッシュ / 消えた / 保存できない / ログインできない / データ消失 / 起動しない');
  lines.push('- 🟡 中：表示崩れ / レイアウト / 動作がおかしい / 遅い / 使いにくい');
  lines.push('- 🟢 低：要望 / 追加してほしい / あったらいい / デザイン変更');
  lines.push('');
  lines.push('### 🔴 高優先度');
  lines.push('');
  lines.push(section(high, ''));
  lines.push('');
  lines.push('### 🟡 中優先度');
  lines.push('');
  lines.push(section(mid, ''));
  lines.push('');
  lines.push('### 🟢 低優先度');
  lines.push('');
  lines.push(section(low, ''));
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## カテゴリ別分類');
  lines.push('');
  lines.push('### 不具合報告');
  lines.push('');
  lines.push(section(bugs, ''));
  lines.push('');
  lines.push('### 改善要望');
  lines.push('');
  lines.push(section(requests, ''));
  lines.push('');
  lines.push('### 機能追加');
  lines.push('');
  lines.push(section(features, ''));
  lines.push('');
  lines.push('### 対応済み候補（resolved 待ち）');
  lines.push('');
  lines.push(section(resolvedPending, ''));
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 高優先度 TOP 3');
  lines.push('');
  if (top3.length) {
    top3.forEach((f, i) => {
      const summary = (f.message || '').replace(/\n/g, ' ').slice(0, 50);
      lines.push(`${i + 1}. **[${shortId(f.id)}]** ${summary}`);
    });
  } else {
    lines.push('（高優先度のフィードバックはありません）');
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 新着フィードバック（直近7日）');
  lines.push('');
  lines.push(section(recent, ''));
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 次に Claude Code へ出す指示案');
  lines.push('');
  lines.push('以下をそのままコピーして Claude Code に貼り付けできます。');
  lines.push('');
  lines.push('```');
  if (high.length) {
    lines.push('【優先度高】以下のフィードバックを確認し、対応方針を提案してください（コード修正はまだしないでください）：');
    high.forEach((f) => lines.push(`- [${shortId(f.id)}] ${(f.message || '').replace(/\n/g, ' ').slice(0, 80)}`));
  } else {
    lines.push('【優先度高】現在、高優先度のフィードバックはありません。');
  }
  lines.push('```');
  lines.push('');
  lines.push('```');
  if (mid.length) {
    lines.push('【優先度中】以下の改善要望について、実装コストと効果を評価してください：');
    mid.forEach((f) => lines.push(`- [${shortId(f.id)}] ${(f.message || '').replace(/\n/g, ' ').slice(0, 80)}`));
  } else {
    lines.push('【優先度中】現在、中優先度のフィードバックはありません。');
  }
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*このレポートは GitHub Actions により自動生成されました。*');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  requireEnv();

  const now = new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  console.log(`[${now}] フィードバック取得中...`);
  const feedbackList = await fetchFeedback();
  console.log(`取得件数: ${feedbackList.length} 件`);

  const outPath = join(process.cwd(), 'docs', 'feedback-daily-report.md');

  if (feedbackList.length === 0) {
    const report = `# Camply フィードバック日次レポート\n\n**実行日時:** ${now}\n\n未対応フィードバックはありません。\n`;
    writeFileSync(outPath, report, 'utf8');
    console.log('未対応フィードバックなし。レポートを出力しました。');
    return;
  }

  const report = buildReport(feedbackList, now);
  writeFileSync(outPath, report, 'utf8');
  console.log(`レポート出力完了: ${outPath}`);
}

main().catch((err) => {
  console.error('エラー:', err.message);
  process.exit(1);
});
