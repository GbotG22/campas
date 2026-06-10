create table if not exists public.fixed_expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  amount       int  not null check (amount > 0),
  payment_day  int  not null check (payment_day between 1 and 31),
  category     text not null default 'other'
                 check (category in (
                   'rent', 'electricity', 'gas',
                   'water', 'telecom', 'insurance', 'other'
                 )),
  memo         text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger fixed_expenses_updated_at
  before update on public.fixed_expenses
  for each row execute function handle_updated_at();

create index if not exists fixed_expenses_user on public.fixed_expenses(user_id);

alter table public.fixed_expenses enable row level security;
create policy "fixed_expenses: own rows only"
  on public.fixed_expenses for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
