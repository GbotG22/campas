-- ============================================================
-- 8. profiles（ユーザープロフィール）
-- ============================================================
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text check (
    display_name is null
    or (char_length(trim(display_name)) between 1 and 30)
  ),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function handle_updated_at();

-- RLS
alter table public.profiles enable row level security;

create policy "profiles: own rows only"
  on public.profiles
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
