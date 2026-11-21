drop function if exists public.set_paragraph_formats(uuid, jsonb);
alter table public.paragraphs drop column if exists format;
