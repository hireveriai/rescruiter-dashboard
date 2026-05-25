-- Stores invoice PDFs in Postgres as a fallback when object storage is unavailable.
-- Safe to run multiple times.

alter table public.invoices
  add column if not exists invoice_pdf_data bytea;
