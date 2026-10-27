\set ON_ERROR_STOP on
-- 0019 (publicação atômica) e 0020 (limite de uso). Usa os usuários de assertions-duo.sql: E (equipe), A e B (alunos).
\set E '\'e1111111-1111-4111-8111-111111111111\''
\set A '\'a2222222-2222-4222-8222-222222222222\''
\set B '\'b3333333-3333-4333-8333-333333333333\''
reset role;
insert into public.disciplines(id, slug, title, position) values ('f0000000-0000-4000-8000-0000000000a1', 'publicacao', 'Publicação', 50);
insert into public.content_versions(id, discipline_id, label, source_sha256, status, published_at) values
  ('f1000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1', 'p1', 'h', 'published', now()),
  ('f1000000-0000-4000-8000-0000000000a2', 'f0000000-0000-4000-8000-0000000000a1', 'd1', 'h', 'draft', null),
  ('f1000000-0000-4000-8000-0000000000a3', 'f0000000-0000-4000-8000-0000000000a1', 'd2', 'h', 'draft', null),
  ('f1000000-0000-4000-8000-0000000000a4', 'f0000000-0000-4000-8000-0000000000a1', 'd3', 'h', 'draft', null);

-- Só o servidor (chave de serviço) publica por ela: nem a equipe chama direto pelo navegador
set role authenticated; select set_config('request.jwt.claim.sub', :E, false);
do $$ begin
  begin
    perform public.publish_content_version('f1000000-0000-4000-8000-0000000000a2');
    raise exception 'FALHA: a função foi chamada sem a chave de serviço';
  exception when insufficient_privilege then null; end;
end $$;

reset role; set role service_role;
do $$ declare r record; begin
  select * into r from public.publish_content_version('f1000000-0000-4000-8000-0000000000a2');
  if not r.promoted or r.previous_id is distinct from 'f1000000-0000-4000-8000-0000000000a1' then raise exception 'FALHA: publicação devolveu %', r; end if;
  if (select status from public.content_versions where id = 'f1000000-0000-4000-8000-0000000000a1') <> 'archived' then raise exception 'FALHA: a anterior não foi arquivada'; end if;
  if (select published_at from public.content_versions where id = 'f1000000-0000-4000-8000-0000000000a2') is null then raise exception 'FALHA: sem data de publicação'; end if;
  select * into r from public.publish_content_version('f1000000-0000-4000-8000-0000000000a2');
  if r.promoted then raise exception 'FALHA: publicou a mesma versão duas vezes'; end if;
  begin
    perform public.publish_content_version('f1000000-0000-4000-8000-0000000000a1');
    raise exception 'FALHA: republicou uma versão arquivada';
  exception when others then if sqlerrm <> 'version_not_draft' then raise; end if; end;
end $$;
select 'OK  0019: só a chave de serviço publica; arquiva a anterior, é idempotente e não republica arquivada';

-- Falha no meio da publicação (simulada ao promover d2): nada muda, d1 continua publicada
reset role;
create function public.test_block_publish() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$;
create trigger test_block_publish before update on public.content_versions for each row
  when (new.id = 'f1000000-0000-4000-8000-0000000000a3' and new.status = 'published') execute function public.test_block_publish();
set role service_role;
do $$ begin
  begin
    perform public.publish_content_version('f1000000-0000-4000-8000-0000000000a3');
    raise exception 'FALHA: a falha simulada não interrompeu a publicação';
  exception when others then if sqlerrm <> 'falha simulada' then raise; end if; end;
end $$;
reset role;
drop trigger test_block_publish on public.content_versions;
drop function public.test_block_publish();
do $$ begin
  if (select status from public.content_versions where id = 'f1000000-0000-4000-8000-0000000000a2') <> 'published' then raise exception 'FALHA: a falha no meio deixou a disciplina sem material publicado'; end if;
  if (select status from public.content_versions where id = 'f1000000-0000-4000-8000-0000000000a3') <> 'draft' then raise exception 'FALHA: d2 mudou apesar da falha'; end if;
end $$;
select 'OK  0019: falha no meio da publicação não muda nada (a versão publicada continua no ar)';

-- 0020: limite por aluno, com a janela e o máximo definidos no banco
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
do $$ declare ok boolean; n int := 0; begin
  for i in 1..12 loop select public.take_rate_limit('export') into ok; if ok then n := n + 1; end if; end loop;
  if n <> 10 then raise exception 'FALHA: % exportações liberadas na janela (esperado 10)', n; end if;
  if not public.take_rate_limit('pdf') then raise exception 'FALHA: a cota de PDF dividiu a de exportação'; end if;
  begin
    perform public.take_rate_limit('outro');
    raise exception 'FALHA: aceitou limite desconhecido';
  exception when invalid_parameter_value then null; end;
  if (select count(*) from public.rate_limits) <> 0 then raise exception 'FALHA: aluno lê a tabela de limites'; end if;
  update public.rate_limits set hits = 0; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHA: aluno zerou o próprio limite'; end if;
end $$;
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :B, false);
do $$ begin if not public.take_rate_limit('export') then raise exception 'FALHA: o limite de A barrou B'; end if; end $$;
-- Janela vencida: a contagem recomeça
reset role;
update public.rate_limits set window_start = now() - interval '11 minutes' where user_id = :A and bucket = 'export';
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
do $$ begin if not public.take_rate_limit('export') then raise exception 'FALHA: a janela vencida não recomeçou a contagem'; end if; end $$;
reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform public.take_rate_limit('pdf');
    raise exception 'FALHA: visitante usou o limite';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'OK  0020: 10 exportações por janela, cotas separadas por aluno e por tipo, janela recomeça, tabela fechada';
