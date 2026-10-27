-- Publicação de uma versão numa transação só: a anterior é arquivada e a nova publicada juntas, ou nada muda.
-- Antes eram duas chamadas separadas, e uma falha entre elas deixava a disciplina sem material publicado.
-- Só o servidor chama (chave de serviço, depois de conferir que quem pede é da equipe).
create or replace function public.publish_content_version(p_version_id uuid)
returns table (promoted boolean, previous_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v public.content_versions;
  prev uuid;
begin
  select * into v from public.content_versions where id = p_version_id;
  if not found then raise exception 'version_not_found' using errcode = 'P0002'; end if;
  -- Fila por disciplina: uma segunda publicação espera a primeira terminar e já enxerga o que ela publicou.
  perform 1 from public.disciplines where id = v.discipline_id for update;
  select * into v from public.content_versions where id = p_version_id for update;
  if not found then raise exception 'version_not_found' using errcode = 'P0002'; end if;
  -- Já publicada (clique duplo, duas abas): nada muda.
  if v.status = 'published' then return query select false, null::uuid; return; end if;
  if v.status <> 'draft' then raise exception 'version_not_draft' using errcode = 'P0001'; end if;
  update public.content_versions set status = 'archived' where discipline_id = v.discipline_id and status = 'published' returning id into prev;
  update public.content_versions set status = 'published', published_at = now() where id = p_version_id;
  return query select true, prev;
end $$;
revoke execute on function public.publish_content_version(uuid) from public, anon, authenticated;
grant execute on function public.publish_content_version(uuid) to service_role;
