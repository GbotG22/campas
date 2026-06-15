// @ts-check
// Node.js 18+ — fetch built-in, zero extra dependencies, no external AI API
// Camply 朝レポート最小実装。個人情報（user_id / email）はレポートに出力しない。
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

const restHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

/** ISO 文字列: now - hours */
function hoursAgoISO(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * PostgREST で件数のみ取得（content-range ヘッダ利用、本文は返さない）
 * @param {string} table
 * @param {string} column  フィルタ対象カラム（created_at / updated_at）
 * @param {string} sinceISO
 * @returns {Promise<number>}
 */
async function countSince(table, column, sinceISO) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id&${column}=gte.${encodeURIComponent(sinceISO)}`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: { ...restHeaders, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Supabase count ${table}.${column} ${res.status}`);
  }
  const range = res.headers.get('content-range') || '*/0';
  const total = range.split('/')[1];
  return parseInt(total, 10) || 0;
}

/**
 * Auth Admin API で全ユーザーを取得し、日付集計（個人情報はカウントのみに使用）
 * @returns {Promise<{total:number,new24h:number,new7d:number,login24h:number}>}
 */
async function fetchUserStats() {
  const since24h = Date.now() - 24 * 60 * 60 * 1000;
  const since7d = Date.now() - 7 * 24 * 60 * 60 * 1000;

  let page = 1;
  const perPage = 1000;
  let total = 0;
  let new24h = 0;
  let new7d = 0;
  let login24h = 0;

  for (;;) {
    const url = `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;
    const res = await fetch(url, { headers: restHeaders });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Auth Admin API ${res.status}: ${body}`);
    }
    const data = await res.json();
    const users = data.users || [];
    if (users.length === 0) break;

    for (const u of users) {
      total += 1;
      const created = u.created_at ? new Date(u.created_at).getTime() : 0;
      const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
      if (created >= since24h) new24h += 1;
      if (created >= since7d) new7d += 1;
      if (lastSignIn >= since24h) login24h += 1;
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return { total, new24h, new7d, login24h };
}

/** feedback 要約（件数のみ。本文は出さない） */
async function fetchFeedbackSummary() {
  const url =
    `${SUPABASE_URL}/rest/v1/feedback` +
    `?status=in.(open,in_progress)` +
    `&select=status,message,created_at`;
  const res = await fetch(url, { headers: restHeaders });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase feedback ${res.status}: ${body}`);
  }
  /** @type {{status:string,message:string,created_at:string}[]} */
  const list = await res.json();

  const HIGH = ['クラッシュ', '消えた', '消失', '保存できない', '保存されない', 'ログインできない', 'ログイン不可', '起動しない', '落ちる', 'フリーズ'];
  const since24h = Date.now() - 24 * 60 * 60 * 1000;

  let open = 0;
  let inProgress = 0;
  let high = 0;
  let recent24h = 0;
  for (const f of list) {
    if (f.status === 'open') open += 1;
    if (f.status === 'in_progress') inProgress += 1;
    if (HIGH.some((k) => (f.message || '').includes(k))) high += 1;
    if (new Date(f.created_at).getTime() >= since24h) recent24h += 1;
  }
  return { open, inProgress, high, recent24h, total: list.length };
}

async function tableActivity(table) {
  const since = hoursAgoISO(24);
  const created = await countSince(table, 'created_at', since);
  const updated = await countSince(table, 'updated_at', since);
  return { created, updated };
}

function buildReport(now, users, activity, feedback) {
  const lines = [];
  lines.push('# Camply 朝レポート');
  lines.push('');
  lines.push(`**実行日時:** ${now}`);
  lines.push('');
  lines.push('> 自動生成レポートです。個人情報（user_id・メールアドレス等）は含みません。件数の集計のみを表示しています。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. ユーザー統計');
  lines.push('');
  lines.push('| 項目 | 件数 |');
  lines.push('|------|------|');
  lines.push(`| 総ユーザー数 | ${users.total} |`);
  lines.push(`| 直近24時間の新規ユーザー | ${users.new24h} |`);
  lines.push(`| 直近7日間の新規ユーザー | ${users.new7d} |`);
  lines.push(`| 直近24時間のログイン | ${users.login24h} |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 2. 利用状況（直近24時間）');
  lines.push('');
  lines.push('| テーブル | 新規 | 更新 |');
  lines.push('|----------|------|------|');
  lines.push(`| timetable_slots | ${activity.timetable_slots.created} | ${activity.timetable_slots.updated} |`);
  lines.push(`| events | ${activity.events.created} | ${activity.events.updated} |`);
  lines.push(`| assignments | ${activity.assignments.created} | ${activity.assignments.updated} |`);
  lines.push(`| expenses | ${activity.expenses.created} | ${activity.expenses.updated} |`);
  lines.push('');
  lines.push('※「更新」は updated_at が直近24時間のレコード数（新規追加分を含む）。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 3. フィードバック要約');
  lines.push('');
  lines.push('| 項目 | 件数 |');
  lines.push('|------|------|');
  lines.push(`| 未対応（open） | ${feedback.open} |`);
  lines.push(`| 対応中（in_progress） | ${feedback.inProgress} |`);
  lines.push(`| 高優先度 | ${feedback.high} |`);
  lines.push(`| 新着（直近24時間） | ${feedback.recent24h} |`);
  lines.push('');
  lines.push('詳細は [feedback-daily-report.md](./feedback-daily-report.md) を参照。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 4. クラッシュ・エラー');
  lines.push('');
  lines.push('計測基盤なし（未導入）。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*このレポートは GitHub Actions により毎朝 8:00（JST）に自動生成されます。*');
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

  console.log(`[${now}] 朝レポート生成中...`);

  const users = await fetchUserStats();
  console.log(`ユーザー: total=${users.total}, new24h=${users.new24h}`);

  const activity = {
    timetable_slots: await tableActivity('timetable_slots'),
    events: await tableActivity('events'),
    assignments: await tableActivity('assignments'),
    expenses: await tableActivity('expenses'),
  };

  const feedback = await fetchFeedbackSummary();
  console.log(`feedback: open=${feedback.open}, in_progress=${feedback.inProgress}`);

  const report = buildReport(now, users, activity, feedback);
  const outPath = join(process.cwd(), 'docs', 'camply-daily-report.md');
  writeFileSync(outPath, report, 'utf8');
  console.log(`朝レポート出力完了: ${outPath}`);
}

main().catch((err) => {
  console.error('エラー:', err.message);
  process.exit(1);
});
