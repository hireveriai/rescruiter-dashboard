-- AI Screening upload batch patch
-- Run this in each Supabase environment where resume upload fails with:
-- column "upload_batch_id" of relation "candidates" does not exist

alter table if exists public.candidates
  add column if not exists upload_batch_id uuid;

update public.candidates
set upload_batch_id = (extracted_json->>'uploadBatchId')::uuid
where upload_batch_id is null
  and extracted_json ? 'uploadBatchId'
  and extracted_json->>'uploadBatchId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$';

create index if not exists idx_candidates_ai_screening_upload_batch
  on public.candidates (organization_id, upload_batch_id, created_at desc)
  where upload_batch_id is not null;
