-- Adds audit tracking for optional VERIS Screening add-ons selected during checkout.
-- Safe to run multiple times.

alter table public.hireveri_payments
  add column if not exists "addonPlanId" text;

create index if not exists hireveri_payments_addon_plan_id_idx
  on public.hireveri_payments ("addonPlanId")
  where "addonPlanId" is not null;
