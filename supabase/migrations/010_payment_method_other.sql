-- payment_method の選択肢を cash / credit / other に変更
-- debit は other として扱う（既存データを移行してから制約を更新）

alter table public.expenses
  drop constraint if exists expenses_payment_method_check;

update public.expenses
  set payment_method = 'other'
  where payment_method = 'debit';

alter table public.expenses
  add constraint expenses_payment_method_check
    check (payment_method in ('cash', 'credit', 'other'));
