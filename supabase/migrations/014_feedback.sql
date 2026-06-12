-- 014: ユーザーフィードバック収集テーブル
--
-- category : 不具合報告 / 改善要望 / 新機能の提案 / その他
-- message  : フィードバック本文（必須）
-- screenshot_url : 添付画像URL（将来拡張用、任意）
-- app_version : クライアント側から送信するバージョン文字列

CREATE TABLE IF NOT EXISTS public.feedback (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category          text        NOT NULL CHECK (category IN ('不具合報告', '改善要望', '新機能の提案', 'その他')),
  message           text        NOT NULL CHECK (char_length(message) > 0),
  screenshot_url    text,
  app_version       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のフィードバックのみ INSERT できる（SELECT/UPDATE/DELETE 不可）
CREATE POLICY "feedback_insert_own"
  ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 管理用：service_role はすべての操作が可能（RLS bypass）
-- 将来の管理画面はサービスロールキーを使って全件取得する
