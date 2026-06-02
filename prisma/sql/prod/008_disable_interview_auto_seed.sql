-- Disable legacy database-side interview question seeding.
-- The application prepares role-aware questions after creating an interview link.
-- Keeping this trigger enabled can expose raw JD/resume fragments as candidate-facing questions
-- if async preparation fails or older send flows bypass preparation.

drop trigger if exists trg_prepare_interview_on_insert on public.interviews;

create or replace function public.trg_prepare_interview_on_insert()
returns trigger
language plpgsql
as $$
begin
  return new;
end;
$$;

create or replace function public.ensure_interview_questions_seeded(
  p_interview_id uuid,
  p_force_regenerate boolean default false
)
returns integer
language plpgsql
as $$
begin
  return 0;
end;
$$;
