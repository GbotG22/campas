-- 016: feedbackテーブルにBuild追跡カラムを追加
--
-- reported_in_build : フィードバック送信時のBuild番号（CFBundleVersion）
-- resolved_in_build : 対応完了にしたBuild番号（status=resolved 時の付帯情報）
--
-- どちらも null 許容。status とのCHECK制約は付けず、運用で整合を取る。

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS reported_in_build integer,
  ADD COLUMN IF NOT EXISTS resolved_in_build integer;

CREATE INDEX IF NOT EXISTS feedback_reported_build_idx
  ON public.feedback (reported_in_build);

CREATE INDEX IF NOT EXISTS feedback_resolved_build_idx
  ON public.feedback (resolved_in_build);
