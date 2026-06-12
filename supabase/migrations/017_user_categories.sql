-- 017: ユーザー定義カテゴリ（Build 50: まずは支出のみ。将来 event/task に拡張可能）
--
-- ・expenses.category は自由テキストのまま（FK化しない）。名前一致で色を解決する
-- ・デフォルトカテゴリは migration では投入せず、クライアント側で冪等に投入する
--   （0件チェック + UNIQUE 制約で二重投入を防止）

CREATE TABLE IF NOT EXISTS public.user_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'event', 'task')),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 20),
  color       text NOT NULL DEFAULT '#9CA3AF',
  sort_order  integer NOT NULL DEFAULT 0,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, name)
);

ALTER TABLE public.user_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_categories_all_own"
  ON public.user_categories FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_categories_user_type_idx
  ON public.user_categories (user_id, type, sort_order);
