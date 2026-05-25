-- HireVeri Razorpay billing extension for PROD.
-- Uses existing pricing tables:
--   public.hireveri_plans
--   public.hireveri_user_subscriptions
--   public.hireveri_payments

begin;

create extension if not exists pgcrypto;

alter type "PaymentStatus" add value if not exists 'cancelled';

alter table public.organizations
  add column if not exists gst_number text,
  add column if not exists billing_address text,
  add column if not exists finance_email text,
  add column if not exists invoice_recipient_email text;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

alter table public.hireveri_user_subscriptions
  add column if not exists "organizationId" uuid,
  add column if not exists "screeningCredits" integer not null default 0,
  add column if not exists status text not null default 'pending',
  add column if not exists "amountPaid" integer not null default 0,
  add column if not exists currency text not null default 'INR',
  add column if not exists "razorpayOrderId" text,
  add column if not exists "razorpayPaymentId" text,
  add column if not exists "activatedAt" timestamptz,
  add column if not exists "expiresAt" timestamptz;

update public.hireveri_user_subscriptions s
set "organizationId" = u.organization_id
from public.users u
where s."organizationId" is null
  and s."userId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and u.user_id = s."userId"::uuid;

alter table public.hireveri_user_subscriptions
  alter column "organizationId" set not null;

alter table public.hireveri_user_subscriptions
  drop constraint if exists "hireveri_user_subscriptions_userId_key";

create unique index if not exists hireveri_user_subscriptions_organization_id_key
  on public.hireveri_user_subscriptions ("organizationId");

create index if not exists hireveri_user_subscriptions_status_expires_at_idx
  on public.hireveri_user_subscriptions (status, "expiresAt");

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hireveri_user_subscriptions_organization_id_fkey'
  ) then
    alter table public.hireveri_user_subscriptions
      add constraint hireveri_user_subscriptions_organization_id_fkey
      foreign key ("organizationId") references public.organizations(organization_id)
      on delete cascade;
  end if;
end;
$$;

drop trigger if exists set_hireveri_user_subscriptions_updated_at on public.hireveri_user_subscriptions;
create trigger set_hireveri_user_subscriptions_updated_at
before update on public.hireveri_user_subscriptions
for each row execute function public.set_updated_at();

alter table public.hireveri_payments
  add column if not exists "updatedAt" timestamptz not null default now(),
  add column if not exists "organizationId" uuid,
  add column if not exists "planId" text,
  add column if not exists "couponId" uuid,
  add column if not exists "couponCode" text,
  add column if not exists "originalAmountPaise" integer,
  add column if not exists "discountPercentage" numeric(5,2) not null default 0,
  add column if not exists "discountAmountPaise" integer not null default 0,
  add column if not exists "gstPercentage" numeric(5,2) not null default 18,
  add column if not exists "gstAmountPaise" integer not null default 0,
  add column if not exists "finalAmountPaise" integer,
  add column if not exists currency text not null default 'INR',
  add column if not exists "razorpayOrderId" text,
  add column if not exists "razorpayPaymentId" text,
  add column if not exists "razorpaySignature" text,
  add column if not exists "razorpayPaymentStatus" text,
  add column if not exists "razorpayPaymentPayload" jsonb,
  add column if not exists "failureReason" text;

create unique index if not exists hireveri_payments_razorpay_order_id_key
  on public.hireveri_payments ("razorpayOrderId")
  where "razorpayOrderId" is not null;

create unique index if not exists hireveri_payments_razorpay_payment_id_key
  on public.hireveri_payments ("razorpayPaymentId")
  where "razorpayPaymentId" is not null;

create index if not exists hireveri_payments_org_created_at_idx
  on public.hireveri_payments ("organizationId", "createdAt" desc);

drop trigger if exists set_hireveri_payments_updated_at on public.hireveri_payments;
create trigger set_hireveri_payments_updated_at
before update on public.hireveri_payments
for each row execute function public.set_updated_at();

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_percentage numeric(5,2) not null check (discount_percentage > 0 and discount_percentage <= 100),
  max_global_uses integer check (max_global_uses is null or max_global_uses >= 0),
  current_global_uses integer not null default 0 check (current_global_uses >= 0),
  is_active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  applicable_plan_ids text[] not null default '{}'::text[],
  minimum_amount_paise integer check (minimum_amount_paise is null or minimum_amount_paise >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_valid_window_chk check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create unique index if not exists coupons_code_upper_key
  on public.coupons (upper(code));

create index if not exists coupons_active_window_idx
  on public.coupons (is_active, starts_at, expires_at);

create table if not exists public.coupon_usages (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  payment_id text references public.hireveri_payments(id) on delete set null,
  used_at timestamptz not null default now(),
  constraint coupon_usages_coupon_org_key unique (coupon_id, organization_id)
);

create index if not exists coupon_usages_org_used_at_idx
  on public.coupon_usages (organization_id, used_at desc);

create sequence if not exists public.hireveri_invoice_number_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  subscription_id text not null references public.hireveri_user_subscriptions(id) on delete restrict,
  payment_id text not null references public.hireveri_payments(id) on delete restrict,
  invoice_number text not null unique,
  invoice_date timestamptz not null default now(),
  recruiter_email text,
  organization_name text not null,
  gst_number text,
  billing_address text,
  plan_name text not null,
  interview_credits integer not null default 0,
  screening_credits integer not null default 0,
  original_amount_paise integer not null,
  discount_amount_paise integer not null default 0,
  taxable_amount_paise integer not null,
  gst_percentage numeric(5,2) not null default 18,
  gst_amount_paise integer not null default 0,
  final_amount_paise integer not null,
  currency text not null default 'INR',
  coupon_code text,
  razorpay_order_id text,
  razorpay_payment_id text,
  invoice_pdf_url text,
  invoice_pdf_bucket text,
  invoice_pdf_key text,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invoices_payment_id_key unique (payment_id),
  constraint invoices_amounts_nonnegative_chk check (
    original_amount_paise >= 0
    and discount_amount_paise >= 0
    and taxable_amount_paise >= 0
    and gst_amount_paise >= 0
    and final_amount_paise >= 0
  )
);

create index if not exists invoices_organization_invoice_date_idx
  on public.invoices (organization_id, invoice_date desc);

create index if not exists invoices_subscription_id_idx
  on public.invoices (subscription_id);

commit;
