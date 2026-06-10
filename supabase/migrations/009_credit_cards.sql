-- ================================================================
-- Camply v1.1 – クレジットカード管理
-- ================================================================
-- 既存データは一切壊れません（ALTER は nullable / default 付き）

-- ────────────────────────────────────────────────────────────────
-- 1. credit_cards（カードマスタ）
-- ────────────────────────────────────────────────────────────────
create table if not exists public.credit_cards (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  name                 text not null,
  color                text not null default '#4F8EF7',
  closing_day          int  not null check (closing_day  between 1 and 31),
  payment_day          int  not null check (payment_day  between 1 and 31),
  payment_month_offset int  not null default 1 check (payment_month_offset in (0, 1)),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger credit_cards_updated_at
  before update on public.credit_cards
  for each row execute function handle_updated_at();

create index if not exists credit_cards_user on public.credit_cards(user_id);

alter table public.credit_cards enable row level security;
create policy "credit_cards: own rows only"
  on public.credit_cards for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 2. expenses へカラム追加（既存データは cash / null で保持）
-- ────────────────────────────────────────────────────────────────
alter table public.expenses
  add column if not exists payment_method text
    not null default 'cash'
    check (payment_method in ('cash', 'debit', 'credit'));

alter table public.expenses
  add column if not exists credit_card_id uuid
    references public.credit_cards(id) on delete set null;

create index if not exists expenses_card on public.expenses(credit_card_id)
  where credit_card_id is not null;
