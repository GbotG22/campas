-- ================================================================
-- 005_fix_idempotent.sql
-- このファイルは何度実行しても安全です（冪等設計）
-- バイト先追加エラーや予定追加エラーが出た場合は、
-- Supabase SQL Editor でこのファイルの内容を貼り付けて実行してください。
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 0. updated_at 自動更新トリガー関数
-- ────────────────────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ────────────────────────────────────────────────────────────────
-- 1. events
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
  start_time        text,
  end_time          text,
  all_day           boolean not null default true,
  is_done           boolean not null default false,
  color             text,
  timetable_slot_id uuid references public.timetable_slots(id) on delete set null,
  external_source   text not null default 'manual'
    check (external_source in ('manual','google_calendar','ios_calendar','shiftboard')),
  external_id       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists events_user_date on public.events(user_id, start_date);

alter table public.events enable row level security;

drop policy if exists "events: own rows only" on public.events;
create policy "events: own rows only"
  on public.events for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at
  before update on public.events
  for each row execute function public.handle_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 2. workplaces
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

alter table public.workplaces enable row level security;

drop policy if exists "workplaces: own rows only" on public.workplaces;
create policy "workplaces: own rows only"
  on public.workplaces for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists workplaces_updated_at on public.workplaces;
create trigger workplaces_updated_at
  before update on public.workplaces
  for each row execute function public.handle_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 3. shifts
-- ────────────────────────────────────────────────────────────────
create table if not exists public.shifts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  workplace_id     uuid not null references public.workplaces(id) on delete cascade,
  date             date not null,
  start_time       text not null,
  end_time         text not null,
  break_minutes    int  not null default 0,
  estimated_wage   int,
  note             text,
  external_source  text not null default 'manual'
    check (external_source in ('manual','google_calendar','ios_calendar','shiftboard')),
  external_id      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists shifts_user_date on public.shifts(user_id, date);

alter table public.shifts enable row level security;

drop policy if exists "shifts: own rows only" on public.shifts;
create policy "shifts: own rows only"
  on public.shifts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists shifts_updated_at on public.shifts;
create trigger shifts_updated_at
  before update on public.shifts
  for each row execute function public.handle_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 4. incomes
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

create index if not exists incomes_user_date on public.incomes(user_id, received_at);

alter table public.incomes enable row level security;

drop policy if exists "incomes: own rows only" on public.incomes;
create policy "incomes: own rows only"
  on public.incomes for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists incomes_updated_at on public.incomes;
create trigger incomes_updated_at
  before update on public.incomes
  for each row execute function public.handle_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 5. salary_records
-- ────────────────────────────────────────────────────────────────
create table if not exists public.salary_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workplace_id  uuid references public.workplaces(id) on delete set null,
  year_month    text not null,
  amount        int  not null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists salary_records_user_month on public.salary_records(user_id, year_month);

alter table public.salary_records enable row level security;

drop policy if exists "salary_records: own rows only" on public.salary_records;
create policy "salary_records: own rows only"
  on public.salary_records for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists salary_records_updated_at on public.salary_records;
create trigger salary_records_updated_at
  before update on public.salary_records
  for each row execute function public.handle_updated_at();

-- ────────────────────────────────────────────────────────────────
-- 6. スキーマキャッシュを強制リロード（PGRST205 対策）
-- ────────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────
-- 確認クエリ（コメントアウト解除して使用）
-- ────────────────────────────────────────────────────────────────
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--   and tablename in ('events','workplaces','shifts','incomes','salary_records');
