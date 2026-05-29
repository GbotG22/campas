-- 006_fix_renewal_day.sql
-- renewal_day の CHECK 制約を 1〜28 から 1〜31 に拡張する
-- 29〜31 日は存在しない月では通知計算時に月末へ自動補正（クライアント側で処理済み）
--
-- ▼ Supabase SQL Editor に貼り付けて実行してください ▼

-- STEP 1: pg_constraint からカラム名で制約を検索し、見つかれば DROP
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT con.conname
    INTO v_constraint_name
    FROM pg_constraint con
    JOIN pg_class     cls ON cls.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
   WHERE nsp.nspname = 'public'
     AND cls.relname  = 'subscriptions'
     AND con.contype  = 'c'
     AND pg_get_constraintdef(con.oid) LIKE '%renewal_day%'
   LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.subscriptions DROP CONSTRAINT %I',
      v_constraint_name
    );
    RAISE NOTICE 'Dropped constraint: %', v_constraint_name;
  ELSE
    RAISE NOTICE 'No renewal_day check constraint found (nothing to drop)';
  END IF;
END;
$$;

-- STEP 2: 1〜31 の制約を追加
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_renewal_day_check
  CHECK (renewal_day BETWEEN 1 AND 31);

-- STEP 3: 確認クエリ（制約が 1 AND 31 になっていれば成功）
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.subscriptions'::regclass
   AND contype  = 'c';
