-- ============================================================
-- Campas v1 - Initial Schema
-- ============================================================

-- 共通: updated_at を自動更新するトリガー関数
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- 1. timetable_slots（時間割）
-- ============================================================
create table if not exists public.timetable_slots (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  subject_name            text not null,
  teacher_name            text,
  room                    text,
  day_of_week             smallint not null check (day_of_week between 0 and 6), -- 0=月 〜 6=日
  period                  smallint not null check (period between 1 and 8),       -- 1〜8限
  color                   text default '#4F46E5',
  google_calendar_event_id text,
  semester                text,                                                   -- 例: "2024前期"
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, day_of_week, period, semester)
);

create trigger timetable_slots_updated_at
  before update on public.timetable_slots
  for each row execute function handle_updated_at();

-- RLS
alter table public.timetable_slots enable row level security;

create policy "timetable_slots: own rows only"
  on public.timetable_slots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 2. assignments（課題・TODO）
-- ============================================================
create table if not exists public.assignments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  title               text not null,
  description         text,
  subject_name        text,
  due_date            timestamptz,
  priority            text check (priority in ('low', 'medium', 'high')),
  ai_priority_score   numeric(3,2) check (ai_priority_score between 0 and 1), -- 0.00〜1.00
  status              text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  timetable_slot_id   uuid references public.timetable_slots(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger assignments_updated_at
  before update on public.assignments
  for each row execute function handle_updated_at();

create index assignments_user_status on public.assignments(user_id, status);
create index assignments_due_date    on public.assignments(user_id, due_date);

-- RLS
alter table public.assignments enable row level security;

create policy "assignments: own rows only"
  on public.assignments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. expenses（支出）
-- ============================================================
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  amount      integer not null check (amount > 0),  -- 円単位
  category    text,
  paid_at     date not null default current_date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger expenses_updated_at
  before update on public.expenses
  for each row execute function handle_updated_at();

create index expenses_user_paid_at on public.expenses(user_id, paid_at desc);

-- RLS
alter table public.expenses enable row level security;

create policy "expenses: own rows only"
  on public.expenses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 4. subscriptions（サブスク管理）
-- ============================================================
create table if not exists public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  service_name        text not null,
  amount              integer not null check (amount > 0),  -- 円単位
  billing_cycle       text not null check (billing_cycle in ('monthly', 'yearly')),
  next_billing_date   date not null,
  category            text,
  is_active           boolean not null default true,
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function handle_updated_at();

create index subscriptions_user_active on public.subscriptions(user_id, is_active);

-- RLS
alter table public.subscriptions enable row level security;

create policy "subscriptions: own rows only"
  on public.subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
