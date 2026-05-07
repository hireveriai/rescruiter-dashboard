-- Backfill upload batch manifests from candidates that already carry upload_batch_id.
-- This is a data repair script, not a schema migration.

insert into public.ai_screening_upload_batches (
  batch_id,
  organization_id,
  created_by,
  candidate_ids,
  file_names,
  created_at
)
select
  c.upload_batch_id,
  c.organization_id,
  max(c.created_by::text)::uuid as created_by,
  jsonb_agg(c.candidate_id::text order by c.created_at desc) as candidate_ids,
  jsonb_agg(distinct coalesce(c.extracted_json->>'sourceFileName', '')) filter (
    where coalesce(c.extracted_json->>'sourceFileName', '') <> ''
  ) as file_names,
  max(c.created_at) as created_at
from public.candidates c
where c.upload_batch_id is not null
  and coalesce(c.ai_screening_status, 'READY') <> 'ARCHIVED'
group by c.upload_batch_id, c.organization_id
on conflict (batch_id) do update
set
  organization_id = excluded.organization_id,
  created_by = coalesce(excluded.created_by, public.ai_screening_upload_batches.created_by),
  candidate_ids = excluded.candidate_ids,
  file_names = excluded.file_names,
  created_at = greatest(public.ai_screening_upload_batches.created_at, excluded.created_at);
