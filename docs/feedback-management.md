# フィードバック管理

アプリ内の「ご意見・不具合報告」から送信されたデータを確認・管理する手順です。

---

## テーブル定義

```
feedback
├── id                 uuid        PRIMARY KEY
├── user_id            uuid        → auth.users(id)
├── category           text        '不具合報告' | '改善要望' | '新機能の提案' | 'その他'
├── message            text        本文
├── status             text        'open' | 'in_progress' | 'resolved' | 'wont_fix'  (migration 015)
├── screenshot_url     text        将来拡張用（現在は未使用）
├── app_version        text        送信時のアプリバージョン（例 "1.0.0"）
├── reported_in_build  integer     送信時のBuild番号（CFBundleVersion、例 47）  (migration 016)
├── resolved_in_build  integer     対応完了にしたBuild番号（手動更新）          (migration 016)
└── created_at         timestamptz
```

### バージョン軸の役割分担

| カラム | 意味 | 更新タイミング |
|---|---|---|
| `app_version` | マーケティングバージョン（"1.0.0"）。ビルド間で変わらない | 送信時（自動） |
| `reported_in_build` | **どのBuildから報告されたか**。回帰・再発の追跡に使う | 送信時（自動） |
| `resolved_in_build` | **どのBuildで対応したか**。リリース消化の追跡に使う | resolved にする時（手動） |
| `status` | ワークフロー状態 | 随時（手動） |

> `reported_in_build` / `resolved_in_build` と `status` の間に CHECK 制約は付けていません。
> 整合（resolved にしたら resolved_in_build も入れる等）は運用ルールで担保します。
> Expo Go や取得失敗時は `reported_in_build` が null になります。

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
  reported_in_build,
  resolved_in_build,
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
-- 対応済みにする（対応したBuild番号も必ずセットする）
UPDATE public.feedback
SET status = 'resolved', resolved_in_build = 48
WHERE id = '<対象の UUID>';

-- 対応中にする
UPDATE public.feedback
SET status = 'in_progress'
WHERE id = '<対象の UUID>';
```

### 6. Build別の対応消化件数（resolved_in_build）

「どのBuildで何件閉じたか」をリリースノート作成・進捗報告に使えます。

```sql
SELECT
  resolved_in_build,
  count(*) AS closed
FROM public.feedback
WHERE status = 'resolved' AND resolved_in_build IS NOT NULL
GROUP BY resolved_in_build
ORDER BY resolved_in_build DESC;
```

### 7. Build別の報告件数（reported_in_build）

「どのBuildから不具合が多く来たか」を品質トレンドの把握に使えます。

```sql
SELECT
  reported_in_build,
  category,
  count(*) AS cnt
FROM public.feedback
GROUP BY reported_in_build, category
ORDER BY reported_in_build DESC NULLS LAST, cnt DESC;
```

### 8. 未消化の不具合（特定Build以降で報告 & 未解決）

```sql
SELECT
  id,
  reported_in_build,
  left(message, 80) AS preview,
  created_at
FROM public.feedback
WHERE category = '不具合報告'
  AND status IN ('open', 'in_progress')
  AND reported_in_build >= 47
ORDER BY reported_in_build DESC, created_at DESC;
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

## Build追跡（migration 016）

`reported_in_build` / `resolved_in_build` を **migration 016** で追加済みです（どちらも integer・null許容）。

- **`reported_in_build`**：フィードバック送信時に `expo-application` の `nativeBuildVersion`（iOS CFBundleVersion）を自動記録。Expo Go・取得失敗時は null。
- **`resolved_in_build`**：`status = 'resolved'` にする時に手動でセット（上記 SQL 5）。

### 運用ルール

1. `status` を `resolved` にする時は、**必ず `resolved_in_build` も同じUPDATEでセット**する
2. `app_version`（"1.0.0"）はビルド間で変わらないので、ビルド単位の追跡は必ず `*_in_build` を使う
3. CHECK制約は付けていないので、整合はこのルールで担保する

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
