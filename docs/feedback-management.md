# フィードバック管理

アプリ内の「ご意見・不具合報告」から送信されたデータを確認・管理する手順です。

---

## テーブル定義

```
feedback
├── id               uuid        PRIMARY KEY
├── user_id          uuid        → auth.users(id)
├── category         text        '不具合報告' | '改善要望' | '新機能の提案' | 'その他'
├── message          text        本文
├── status           text        'open' | 'in_progress' | 'resolved' | 'wont_fix'  (migration 015)
├── screenshot_url   text        将来拡張用（現在は未使用）
├── app_version      text        送信時のアプリバージョン
└── created_at       timestamptz
```

---

## Claude Code から確認する方法

以下の SQL を Supabase MCP ツール（`execute_sql`）に渡すと結果が返ります。

### 1. 新着順で全件確認

```sql
SELECT
  id,
  category,
  status,
  message,
  app_version,
  created_at
FROM public.feedback
ORDER BY created_at DESC
LIMIT 50;
```

### 2. カテゴリ別・ステータス別の件数

```sql
SELECT
  category,
  status,
  count(*) AS cnt
FROM public.feedback
GROUP BY category, status
ORDER BY category, status;
```

### 3. 未対応（open）一覧

```sql
SELECT
  id,
  category,
  left(message, 80) AS preview,
  app_version,
  created_at
FROM public.feedback
WHERE status = 'open'
ORDER BY created_at DESC;
```

### 4. 週次トレンド（カテゴリ × 週）

```sql
SELECT
  date_trunc('week', created_at AT TIME ZONE 'Asia/Tokyo')::date AS week_start,
  category,
  count(*) AS cnt
FROM public.feedback
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;
```

### 5. ステータスを更新する

```sql
-- 対応済みにする
UPDATE public.feedback
SET status = 'resolved'
WHERE id = '<対象の UUID>';

-- 対応中にする
UPDATE public.feedback
SET status = 'in_progress'
WHERE id = '<対象の UUID>';
```

---

## Supabase Dashboard から確認する方法

1. [Supabase Dashboard](https://supabase.com/dashboard) → プロジェクト `app` を開く
2. 左メニュー **Table Editor** → `feedback` テーブルを選択
3. フィルター・ソートは GUI で操作可能
4. SQL Editor タブで上記クエリをそのまま実行できる

---

## ステータス管理（migration 015）

`status` カラムは **migration 015** で追加済みです（デフォルト `'open'`）。

| status | 意味 |
|---|---|
| `open` | 未対応（デフォルト） |
| `in_progress` | 対応中 |
| `resolved` | 対応済み |
| `wont_fix` | 対応しない |

---

## 将来の管理画面に向けた設計メモ

現状の RLS ポリシーはユーザーの INSERT のみ許可しています。
管理画面を追加するときは以下のいずれかで実装できます。

### 案 A：管理者ロール（推奨）

```sql
-- 管理者ユーザーに admin ロールを付与
CREATE ROLE admin;
GRANT admin TO '<管理者の UUID>';

-- admin は全件 SELECT/UPDATE 可能
CREATE POLICY "feedback_admin_all"
  ON public.feedback
  FOR ALL
  TO admin
  USING (true)
  WITH CHECK (true);
```

### 案 B：サービスロールキーを使った Next.js 管理ページ

- `SUPABASE_SERVICE_ROLE_KEY` を使う API Route は RLS をバイパスして全件取得可能
- Vercel にデプロイした `/admin/feedback` ページから参照する
- キーは Vercel の Environment Variables に保存し、クライアントには露出させない

### 案 C：Supabase Edge Function

- Edge Function 内でサービスロールクライアントを使って集計し、JSON を返す
- 将来的に Slack/Discord への通知連携もここに追加できる
