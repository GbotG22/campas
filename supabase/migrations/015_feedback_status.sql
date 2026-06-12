-- 015: feedbackテーブルにステータス管理カラムを追加
--
-- status: open（未対応）/ in_progress（対応中）/ resolved（対応済み）/ wont_fix（対応しない）

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix'));

-- 将来の絞り込みクエリを高速化するインデックス
CREATE INDEX IF NOT EXISTS feedback_status_idx      ON public.feedback (status);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx  ON public.feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_category_idx    ON public.feedback (category);
