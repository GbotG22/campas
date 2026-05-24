-- ================================================================
-- Campas v2 – Events & Money (予定・バイト・収入管理)
-- ================================================================
-- Supabase SQL Editor で実行してください。既存データは保持されます。

-- updated_at 自動更新トリガー関数（既存、念のため or replace）
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ────────────────────────────────────────────────────────────────
-- 1. events（汎用予定：課題・テスト・学校行事・個人・サークル等）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  title             text not null,
  description       text,
  event_type        text not null default 'personal'
    check (event_type in (
      'assignment','test','report','school_event',
      'circle','personal','class_cancel','class_makeup','other'
    )),
  start_date        date not null,
  end_date          date,
  start_time        text,    -- "HH:MM"
  end_time          text,    -- "HH:MM"
  all_day           boolean not null default true,
  is_done           boolean not null default false,
  color             text,
  timetable_slot_id uuid references public.timetable_slots(id) on delete set null,
  -- 外部連携（将来用）
  external_source   text not null default 'manual'
    check (external_source in ('manual','google_calendar','ios_calendar','shiftboard')),
  external_id       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger events_updated_at
  before update on public.events
  for each row execute function handle_updated_at();

create index if not exists events_user_date on public.events(user_id, start_date);

alter table public.events enable row level security;
create policy "events: own rows only"
  on public.events for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 2. workplaces（バイト先）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.workplaces (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  hourly_wage     int  not null default 1000,
  color           text not null default '#10B981',
  note            text,
  is_active       boolean not null default true,
  external_source text not null default 'manual'
    check (external_source in ('manual','google_calendar','ios_calendar','shiftboard')),
  external_id     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger workplaces_updated_at
  before update on public.workplaces
  for each row execute function handle_updated_at();

alter table public.workplaces enable row level security;
create policy "workplaces: own rows only"
  on public.workplaces for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 3. shifts（シフト）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.shifts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  workplace_id     uuid not null references public.workplaces(id) on delete cascade,
  date             date not null,
  start_time       text not null,   -- "HH:MM"
  end_time         text not null,   -- "HH:MM"
  break_minutes    int  not null default 0,
  estimated_wage   int,             -- 見込み給与（円）アプリ側で計算して保存
  note             text,
  external_source  text not null default 'manual'
    check (external_source in ('manual','google_calendar','ios_calendar','shiftboard')),
  external_id      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger shifts_updated_at
  before update on public.shifts
  for each row execute function handle_updated_at();

create index if not exists shifts_user_date on public.shifts(user_id, date);

alter table public.shifts enable row level security;
create policy "shifts: own rows only"
  on public.shifts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 4. incomes（収入記録）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.incomes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  amount          int  not null,
  income_type     text not null default 'other'
    check (income_type in ('salary','allowance','bonus','part_time','other')),
  received_at     date not null,
  note            text,
  external_source text not null default 'manual'
    check (external_source in ('manual','google_calendar','ios_calendar','shiftboard')),
  external_id     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger incomes_updated_at
  before update on public.incomes
  for each row execute function handle_updated_at();

create index if not exists incomes_user_date on public.incomes(user_id, received_at);

alter table public.incomes enable row level security;
create policy "incomes: own rows only"
  on public.incomes for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 5. salary_records（給与実績：実際に振り込まれた金額）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.salary_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workplace_id  uuid references public.workplaces(id) on delete set null,
  year_month    text not null,   -- 例: "2026-05"
  amount        int  not null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger salary_records_updated_at
  before update on public.salary_records
  for each row execute function handle_updated_at();

create index if not exists salary_records_user_month on public.salary_records(user_id, year_month);

alter table public.salary_records enable row level security;
create policy "salary_records: own rows only"
  on public.salary_records for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
