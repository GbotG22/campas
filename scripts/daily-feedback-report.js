// @ts-check
// Node.js 18+ — fetch built-in, zero extra dependencies
'use strict';

const { writeFileSync } = require('fs');
const { join } = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

function requireEnv() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY'].filter(
    (k) => !process.env[k],
  );
  if (missing.length > 0) {
    console.error('Missing environment variables:', missing.join(', '));
    process.exit(1);
  }
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

async function analyzeWithClaude(feedbackList, now) {
  const feedbackJson = JSON.stringify(feedbackList, null, 2);

  const prompt = `
あなたはモバイルアプリ「Camply」（iOS向け学生向け大学管理アプリ）の開発担当者向けアシスタントです。
以下のフィードバックデータを分析し、日本語で Markdown レポートを生成してください。

実行日時: ${now}

## フィードバックデータ（JSON）
\`\`\`json
${feedbackJson}
\`\`\`

## 出力形式（このフォーマットをそのまま出力してください）

# Camply フィードバック日次レポート

**実行日時:** ${now}

---

## サマリー

| 項目 | 件数 |
|------|------|
| 未対応（open） | X 件 |
| 対応中（in_progress） | X 件 |
| 合計 | X 件 |

---

## 優先度別一覧

優先度の基準：
- 🔴 高：データ消失・ログイン不可・保存不可・クラッシュ
- 🟡 中：表示崩れ・操作しづらい・誤表示
- 🟢 低：軽微な要望・文言・好みの設定

### 🔴 高優先度

（該当フィードバックを箇条書き。id の末尾8文字、カテゴリ、本文要約、status、Build番号を含める）

### 🟡 中優先度

（同上）

### 🟢 低優先度

（同上）

---

## カテゴリ別分類

### 不具合報告

（該当フィードバックを箇条書き）

### 改善要望

（該当フィードバックを箇条書き）

### 機能追加

（新機能の提案カテゴリのもの）

### 対応済み候補（resolved 待ち）

（in_progress で、文面から既に修正済みと推測されるもの、またはコメントとして記録しておくべきもの）

---

## 高優先度 TOP 3

1. **[id末尾8文字]** — 要約（理由）
2. ...
3. ...

---

## 新着フィードバック（直近7日）

（created_at が ${now} から7日以内のものを列挙）

---

## 次に Claude Code へ出す指示案

以下のプロンプトをそのままコピーして Claude Code に貼り付けることができます。

\`\`\`
【優先度高】以下のフィードバックを確認し、対応方針を提案してください（コード修正はまだしないでください）：

（高優先度フィードバックの内容をここに入れる）
\`\`\`

\`\`\`
【優先度中】以下の改善要望について、実装コストと効果を評価してください：

（中優先度フィードバックの内容をここに入れる）
\`\`\`

---

*このレポートは GitHub Actions により自動生成されました。フィードバックの status は変更されていません。*
`.trim();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.content[0].text;
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

  if (feedbackList.length === 0) {
    const report = `# Camply フィードバック日次レポート\n\n**実行日時:** ${now}\n\n未対応フィードバックはありません。\n`;
    const outPath = join(process.cwd(), 'docs', 'feedback-daily-report.md');
    writeFileSync(outPath, report, 'utf8');
    console.log('未対応フィードバックなし。レポートを出力しました。');
    return;
  }

  console.log('Claude で分析中...');
  const report = await analyzeWithClaude(feedbackList, now);

  const outPath = join(process.cwd(), 'docs', 'feedback-daily-report.md');
  writeFileSync(outPath, report + '\n', 'utf8');
  console.log(`レポート出力完了: ${outPath}`);
}

main().catch((err) => {
  console.error('エラー:', err.message);
  process.exit(1);
});
