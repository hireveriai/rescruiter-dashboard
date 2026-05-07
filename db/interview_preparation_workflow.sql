alter table public.interviews
  add column if not exists question_status text not null default 'PENDING',
  add column if not exists email_status text not null default 'PENDING',
  add column if not exists failure_reason text,
  add column if not exists last_error text,
  add column if not exists questions_generated_at timestamptz,
  add column if not exists email_sent_at timestamptz,
  add column if not exists idempotency_key text;

create unique index if not exists idx_interviews_org_idempotency_key
  on public.interviews (organization_id, idempotency_key)
  where idempotency_key is not null;

alter table public.interview_invites
  drop constraint if exists interview_invites_status_check,
  drop constraint if exists status_check;

alter table public.interview_invites
  add constraint interview_invites_status_check
  check (
    status = any (
      array[
        'ACTIVE',
        'EXPIRED',
        'USED',
        'REVOKED',
        'COMPLETED',
        'CANCELLED',
        'PREPARING',
        'PREPARATION_FAILED'
      ]::text[]
    )
  );
