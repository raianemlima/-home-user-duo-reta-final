\set ON_ERROR_STOP on
-- Usuários: E (equipe), A e B (alunos ativos), I (aluno inativo), N (sem perfil)
\set E '\'e1111111-1111-4111-8111-111111111111\''
\set A '\'a2222222-2222-4222-8222-222222222222\''
\set B '\'b3333333-3333-4333-8333-333333333333\''
\set I '\'c4444444-4444-4444-8444-444444444444\''
\set N '\'d5555555-5555-4555-8555-555555555555\''
insert into auth.users(id, email) values (:E, 'e@duo'), (:A, 'a@duo'), (:B, 'b@duo'), (:I, 'i@duo'), (:N, 'n@duo');
grant all on all tables in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
insert into public.profiles(user_id, email, role) values (:E, 'e@duo', 'equipe'), (:A, 'a@duo', 'aluno'), (:B, 'b@duo', 'aluno'), (:I, 'i@duo', 'aluno');

-- Equipe cria disciplina, versão publicada e rascunho
set role authenticated; select set_config('request.jwt.claim.sub', :E, false);
insert into public.disciplines(id, slug, title, position) values ('f0000000-0000-4000-8000-000000000001', 'penal', 'Direito Penal', 1);
insert into public.content_versions(id, discipline_id, label, source_sha256, status, published_at) values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'v1', 'h1', 'published', now()),
  ('f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'v2', 'h2', 'draft', null);
insert into public.sections(id, version_id, position, level, title, path) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 1, 1, 'S1', '{S1}'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 1, 1, 'S1', '{S1}');
insert into public.paragraphs(id, section_id, version_id, position, kind, text, hash) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 1, 'body', 'Texto publicado.', 'x'),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 1, 'body', 'Texto rascunho.', 'y');

-- single published
do $$ begin
  begin
    update public.content_versions set status = 'published' where id = 'f1000000-0000-4000-8000-000000000002';
    raise exception 'FALHA: duas versões publicadas na mesma disciplina';
  exception when unique_violation then null; end;
end $$;
select 'OK  duo: uma única versão publicada por disciplina';

-- student reads published only
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
do $$ declare n int; begin
  select count(*) into n from public.content_versions; if n <> 1 then raise exception 'FALHA: aluno vê % versões', n; end if;
  select count(*) into n from public.paragraphs; if n <> 1 then raise exception 'FALHA: aluno vê % parágrafos', n; end if;
  select count(*) into n from public.sections; if n <> 1 then raise exception 'FALHA: aluno vê % seções', n; end if;
end $$;
select 'OK  duo: aluno lê só a versão publicada';
insert into public.highlights(id, discipline_id, version_id, start_paragraph_id, start_offset, end_paragraph_id, end_offset, quote, prefix, suffix, color)
  values ('f4000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 0, 'f3000000-0000-4000-8000-000000000001', 5, 'Texto', '', ' publicado.', 'importante');
insert into public.reading_positions(discipline_id, section_id) values ('f0000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001');

-- student cannot write content / promote self
do $$ declare n int; begin
  begin
    insert into public.disciplines(slug, title, position) values ('x', 'X', 9);
    raise exception 'FALHA: aluno criou disciplina';
  exception when insufficient_privilege or check_violation then null; end;
  update public.paragraphs set text = 'alterado'; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHA: aluno alterou parágrafo'; end if;
  update public.profiles set role = 'equipe' where user_id = auth.uid(); get diagnostics n = row_count; if n <> 0 then raise exception 'FALHA: aluno se promoveu'; end if;
  update public.profiles set active = true where user_id = 'c4444444-4444-4444-8444-444444444444'; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHA: aluno alterou outro perfil'; end if;
end $$;
select 'OK  duo: aluno não escreve conteúdo nem altera perfis';
do $$ begin
  begin
    insert into public.notebooks(name) values ('caderno do aluno');
    raise exception 'FALHA: aluno criou caderno do pipeline';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    insert into public.documents(title, file_name, format, size, sha256, extraction_status, storage_path) values ('x', 'x.pdf', 'pdf', 1, 'h', 'text', 'p');
    raise exception 'FALHA: aluno criou documento';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    insert into storage.objects(bucket_id, name) values ('documents', 'a2222222-2222-4222-8222-222222222222/x.pdf');
    raise exception 'FALHA: aluno enviou arquivo ao bucket de documentos';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
select 'OK  duo: aluno não usa o pipeline de ingestão (cadernos, documentos, arquivos)';

-- student isolation
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :B, false);
do $$ declare n int; begin
  select count(*) into n from public.highlights; if n <> 0 then raise exception 'FALHA: B vê grifo de A'; end if;
  select count(*) into n from public.reading_positions; if n <> 0 then raise exception 'FALHA: B vê posição de A'; end if;
  update public.highlights set note = 'x'; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHA: B alterou grifo de A'; end if;
  delete from public.highlights; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHA: B apagou grifo de A'; end if;
  begin
    insert into public.highlights(user_id, discipline_id, version_id, start_paragraph_id, start_offset, end_paragraph_id, end_offset, quote, prefix, suffix, color)
      values ('a2222222-2222-4222-8222-222222222222', 'f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 0, 'f3000000-0000-4000-8000-000000000001', 1, 'T', '', '', 'revisar');
    raise exception 'FALHA: B criou grifo em nome de A';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
select 'OK  duo: grifos e posição de leitura isolados por aluno';

-- inactive student (sessão ainda válida)
reset role; select set_config('request.jwt.claim.sub', '', false);
update public.profiles set active = false where user_id = :A;
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
do $$ declare n int; begin
  select count(*) into n from public.paragraphs; if n <> 0 then raise exception 'FALHA: aluno inativo lê % parágrafos', n; end if;
  select count(*) into n from public.highlights; if n <> 0 then raise exception 'FALHA: aluno inativo lê grifos'; end if;
  select count(*) into n from public.disciplines; if n <> 0 then raise exception 'FALHA: aluno inativo lê disciplinas'; end if;
end $$;
select 'OK  duo: aluno desativado perde acesso na hora';
reset role; select set_config('request.jwt.claim.sub', '', false);
do $$ declare n int; begin
  select count(*) into n from public.highlights; if n <> 1 then raise exception 'FALHA: grifo do aluno inativo foi apagado'; end if;
end $$;

-- user without profile
set role authenticated; select set_config('request.jwt.claim.sub', :N, false);
do $$ declare n int; begin
  select count(*) into n from public.disciplines; if n <> 0 then raise exception 'FALHA: usuário sem perfil vê disciplinas'; end if;
  select count(*) into n from public.paragraphs; if n <> 0 then raise exception 'FALHA: usuário sem perfil vê parágrafos'; end if;
  select count(*) into n from public.profiles; if n <> 0 then raise exception 'FALHA: usuário sem perfil vê perfis'; end if;
end $$;
select 'OK  duo: usuário sem perfil não vê nada';

-- equipe vê tudo, inclusive rascunho e perfis
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :E, false);
do $$ declare n int; begin
  select count(*) into n from public.content_versions; if n <> 2 then raise exception 'FALHA: equipe vê % versões', n; end if;
  select count(*) into n from public.profiles; if n <> 4 then raise exception 'FALHA: equipe vê % perfis', n; end if;
  update public.profiles set active = true where user_id = 'a2222222-2222-4222-8222-222222222222'; get diagnostics n = row_count; if n <> 1 then raise exception 'FALHA: equipe não reativou aluno'; end if;
end $$;
select 'OK  duo: equipe lê rascunhos e gerencia perfis';
insert into public.notebooks(name) values ('ingestão da equipe');
select 'OK  duo: equipe usa o pipeline de ingestão';
reset role;
