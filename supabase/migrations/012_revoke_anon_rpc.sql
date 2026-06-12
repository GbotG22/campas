-- 012: 不要な RPC 実行権限の剥奪（攻撃面の削減）
--
-- delete_user()    : auth.uid() で自分のみ削除するが、未ログイン(anon)から
--                    呼べる必要はないため REVOKE。authenticated には残す
--                    （設定画面のアカウント削除で使用）。
-- rls_auto_enable(): DDL イベントトリガー専用関数。RPC として呼ぶ用途は
--                    一切ないため anon / authenticated 両方から REVOKE。

REVOKE EXECUTE ON FUNCTION public.delete_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_user() FROM public;
GRANT  EXECUTE ON FUNCTION public.delete_user() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM public;
