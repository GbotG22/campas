-- ================================================================
-- Campas v2 – Timetable Enhanced
-- ================================================================
-- Supabase SQL Editor で実行してください。
-- 既存データは保持されます。

-- ────────────────────────────────────────────────────────────────
-- 1. semesters（学期管理）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.semesters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  start_date date,
  end_date   date,
  is_active  boolean not null default false,
  sort_order int    not null default 0,
  created_at timestamptz not null default now()
);

alter table public.semesters enable row level security;

create policy "semesters: own rows only"
  on public.semesters for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 2. period_settings（時限・授業時間設定、ユーザーごとに1行）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.period_settings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  period_count  int  not null default 5,
  periods       jsonb not null default '[
    {"period":1,"start":"08:50","end":"10:20"},
    {"period":2,"start":"10:30","end":"12:00"},
    {"period":3,"start":"13:00","end":"14:30"},
    {"period":4,"start":"14:40","end":"16:10"},
    {"period":5,"start":"16:20","end":"17:50"}
  ]'::jsonb,
  required_rate int not null default 80,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (user_id)
);

create trigger period_settings_updated_at
  before update on public.period_settings
  for each row execute function handle_updated_at();

alter table public.period_settings enable row level security;

create policy "period_settings: own rows only"
  on public.period_settings for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 3. timetable_slots に semester_id を追加
-- ────────────────────────────────────────────────────────────────
alter table public.timetable_slots
  add column if not exists semester_id uuid
    references public.semesters(id) on delete set null;

-- ────────────────────────────────────────────────────────────────
-- 4. class_events（休講・補講・テスト等）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.class_events (
  id         uuid primary key default gen_random_uuid(),
  slot_id    uuid not null references public.timetable_slots(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  event_type text not null
    check (event_type in ('cancel','makeup','test','report','presentation','other')),
  title      text not null,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists class_events_slot_date on public.class_events(slot_id, date);
create index if not exists class_events_user_date on public.class_events(user_id, date);

alter table public.class_events enable row level security;

create policy "class_events: own rows only"
  on public.class_events for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 5. attendance_records（出欠記録）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.attendance_records (
  id         uuid primary key default gen_random_uuid(),
  slot_id    uuid not null references public.timetable_slots(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  status     text not null
    check (status in ('present','absent','late','early_leave')),
  note       text,
  created_at timestamptz not null default now(),
  unique(slot_id, date)
);

create index if not exists attendance_records_slot      on public.attendance_records(slot_id);
create index if not exists attendance_records_user_date on public.attendance_records(user_id, date);

alter table public.attendance_records enable row level security;

create policy "attendance_records: own rows only"
  on public.attendance_records for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 6. class_memos（科目メモ、1スロット1メモ）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.class_memos (
  id         uuid primary key default gen_random_uuid(),
  slot_id    uuid not null references public.timetable_slots(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(slot_id)
);

create trigger class_memos_updated_at
  before update on public.class_memos
  for each row execute function handle_updated_at();

alter table public.class_memos enable row level security;

create policy "class_memos: own rows only"
  on public.class_memos for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 7. class_schedules（授業スケジュール 第N回）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.class_schedules (
  id             uuid primary key default gen_random_uuid(),
  slot_id        uuid not null references public.timetable_slots(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  session_number int  not null,
  title          text not null,
  date           date,
  description    text,
  created_at     timestamptz not null default now(),
  unique(slot_id, session_number)
);

create index if not exists class_schedules_slot on public.class_schedules(slot_id, session_number);

alter table public.class_schedules enable row level security;

create policy "class_schedules: own rows only"
  on public.class_schedules for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
