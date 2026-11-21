-- Formatação do PDF original guardada à parte do texto (negrito, itálico, sublinhado, cor, recuo, marcador e caixa).
-- O texto, o hash e as posições dos parágrafos não mudam: os grifos dos alunos continuam valendo.
alter table public.paragraphs add column if not exists format jsonb null
  check (format is null or (jsonb_typeof(format) = 'object' and pg_column_size(format) <= 16384));

-- Grava a formatação de uma versão inteira numa chamada: {paragraph_id: format}. Parágrafos que não estão no objeto
-- ficam sem formatação (reaplicar é seguro). SECURITY INVOKER: vale o RLS (só a equipe altera parágrafos).
create or replace function public.set_paragraph_formats(p_version_id uuid, p_formats jsonb)
returns integer language sql security invoker set search_path = public as $$
  with cleared as (
    update public.paragraphs set format = null
    where version_id = p_version_id and format is not null and not (p_formats ? id::text)
    returning 1
  ), applied as (
    update public.paragraphs p set format = f.value
    from jsonb_each(p_formats) f
    where p.version_id = p_version_id and p.id::text = f.key
    returning 1
  )
  select count(*)::int from applied;
$$;
revoke all on function public.set_paragraph_formats(uuid, jsonb) from public, anon;
grant execute on function public.set_paragraph_formats(uuid, jsonb) to authenticated;
