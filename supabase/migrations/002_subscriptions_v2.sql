-- ============================================================
-- Campas - Subscriptions v2 (renewal_day ベース)
-- ============================================================
-- 既存テーブルを削除して再作成（開発環境用）
-- 本番移行時は ALTER TABLE で慎重に対応すること

DROP TABLE IF EXISTS public.subscriptions CASCADE;

CREATE TABLE public.subscriptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name text        NOT NULL,
  amount       int         NOT NULL CHECK (amount > 0),
  renewal_day  int         NOT NULL CHECK (renewal_day BETWEEN 1 AND 31),
  memo         text,
  is_active    bool        NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions: 自分のデータのみ"
  ON public.subscriptions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX subscriptions_user_active ON public.subscriptions (user_id, is_active);
