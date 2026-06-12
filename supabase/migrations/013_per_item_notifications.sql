-- 013: 予定・シフトごとの通知設定
--
-- notification_enabled        : この予定/シフト個別の通知を使うか
-- notification_minutes_before : 開始何分前に通知するか（0 = 開始時刻ちょうど、1440 = 1日前）

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS notification_enabled        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_minutes_before integer NOT NULL DEFAULT 0;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS notification_enabled        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_minutes_before integer NOT NULL DEFAULT 0;
