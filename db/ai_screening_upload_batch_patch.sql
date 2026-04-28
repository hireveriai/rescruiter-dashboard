-- AI Screening upload batch patch
-- Run this in each Supabase environment where resume upload fails with:
-- column "upload_batch_id" of relation "candidates" does not exist

alter table if exists public.candidates
  add column if not exists upload_batch_id uuid;

create table if not exists public.ai_screening_upload_batches (
  batch_id uuid primary key,
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  created_by uuid references public.users(user_id) on delete set null,
  candidate_ids jsonb not null default '[]'::jsonb,
  file_names jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

update public.candidates
set upload_batch_id = (extracted_json->>'uploadBatchId')::uuid
where upload_batch_id is null
  and extracted_json ? 'uploadBatchId'
  and extracted_json->>'uploadBatchId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$';

insert into public.ai_screening_upload_batches (
  batch_id,
  organization_id,
  created_by,
  candidate_ids,
  file_names
)
select
  coalesce(c.upload_batch_id, (c.extracted_json->>'uploadBatchId')::uuid) as batch_id,
  c.organization_id,
  c.created_by,
  jsonb_agg(c.candidate_id::text order by c.created_at desc) as candidate_ids,
  jsonb_agg(coalesce(c.extracted_json->>'sourceFileName', c.full_name, 'resume') order by c.created_at desc) as file_names
from public.candidates c
where (
    c.upload_batch_id is not null
    or (
      c.extracted_json ? 'uploadBatchId'
      and c.extracted_json->>'uploadBatchId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$'
    )
  )
group by
  coalesce(c.upload_batch_id, (c.extracted_json->>'uploadBatchId')::uuid),
  c.organization_id,
  c.created_by
on conflict (batch_id) do update
set
  organization_id = excluded.organization_id,
  created_by = excluded.created_by,
  candidate_ids = excluded.candidate_ids,
  file_names = excluded.file_names;

create index if not exists idx_candidates_ai_screening_upload_batch
  on public.candidates (organization_id, upload_batch_id, created_at desc)
  where upload_batch_id is not null;

create index if not exists idx_ai_screening_upload_batches_org_created_at
  on public.ai_screening_upload_batches (organization_id, created_at desc);
