drop policy if exists duo_staff_only_document_objects on storage.objects;
do $$ declare t text; begin
  foreach t in array array['projects','sources','chapters','documents','notebooks','notebook_sources','jobs','job_stages','stage_cache','notebook_versions','blocks','thematic_maps'] loop
    if to_regclass('public.' || t) is not null then execute format('drop policy if exists %I on public.%I', 'duo_staff_only_' || t, t); end if;
  end loop;
end $$;
drop table if exists public.reading_positions;
drop table if exists public.highlights;
drop function if exists public.touch_updated_at();
drop table if exists public.paragraphs;
drop table if exists public.sections;
drop table if exists public.content_versions;
drop table if exists public.disciplines;
drop table if exists public.profiles;
drop function if exists public.is_active_student();
drop function if exists public.is_staff();
