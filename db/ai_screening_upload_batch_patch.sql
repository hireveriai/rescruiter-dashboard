-- AI Screening upload batch patch
-- Run this in each Supabase environment where resume upload fails with:
-- column "upload_batch_id" of relation "candidates" does not exist

alter table if exists public.candidates
  add column if not exists upload_batch_id uuid;

create index if not exists idx_candidates_ai_screening_upload_batch
  on public.candidates (organization_id, upload_batch_id, created_at desc)
  where upload_batch_id is not null;

