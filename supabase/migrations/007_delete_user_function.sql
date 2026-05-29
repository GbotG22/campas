-- ────────────────────────────────────────────────────────────
-- 007_delete_user_function.sql
-- ユーザー自身がアカウントを削除するための DB 関数
--
-- ■ 使い方（クライアント）
--   const { error } = await supabase.rpc('delete_user');
--
-- ■ 安全性
--   - SECURITY DEFINER により postgres 権限で実行される
--   - auth.uid() で「現在ログインしているユーザーのみ」削除可能
--   - 他ユーザーのデータは削除できない
--
-- ■ 実行方法
--   Supabase Dashboard → SQL Editor に貼り付けて Run
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 現在認証されているユーザーのみ削除（auth.uid() で自分のみ）
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- 認証済みユーザーだけが呼び出せるように権限を設定
REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
