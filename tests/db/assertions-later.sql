\set ON_ERROR_STOP on
-- Migrações 0010–0018: avisos, troca de senha, questões, cronogramas e Vade Esperto.
-- Usa os usuários de assertions-duo.sql: E (equipe), A e B (alunos ativos), I (aluno inativo).
\set E '\'e1111111-1111-4111-8111-111111111111\''
\set A '\'a2222222-2222-4222-8222-222222222222\''
\set B '\'b3333333-3333-4333-8333-333333333333\''
\set I '\'c4444444-4444-4444-8444-444444444444\''
reset role;
grant all on all tables in schema public to authenticated, service_role;
update public.profiles set active = false where user_id = :I;

-- Aluno A grava as próprias respostas, escolha de cronograma e aparelho de avisos
set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
insert into public.question_answers(question_id, choice, correct) values ('q1', 'A', true);
insert into public.study_plan_choices(plano) values ('3h');
insert into public.push_subscriptions(endpoint, p256dh, auth) values ('https://push.example/a', 'k', 's');
do $$ declare n int; begin
  update public.profiles set must_change_password = false where user_id = auth.uid(); get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA: aluno alterou o próprio aviso de troca de senha'; end if;
  begin
    insert into public.study_plan_choices(user_id, plano) values (auth.uid(), '8h') on conflict (user_id) do update set plano = excluded.plano;
    raise exception 'FALHA: aceitou cronograma inexistente';
  exception when check_violation then null; end;
end $$;
select 'OK  0012/0016/0018: aluno não baixa o aviso de troca de senha; só cronogramas de 3h, 4h, 6h ou próprio';

-- Aluno B não vê nem grava em nome de A
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :B, false);
do $$ declare n int; begin
  select count(*) into n from public.question_answers; if n <> 0 then raise exception 'FALHA: B vê % respostas de A', n; end if;
  select count(*) into n from public.study_plan_choices; if n <> 0 then raise exception 'FALHA: B vê a escolha de cronograma de A'; end if;
  select count(*) into n from public.push_subscriptions; if n <> 0 then raise exception 'FALHA: B vê o aparelho de A'; end if;
  update public.question_answers set correct = false; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHA: B alterou respostas de A'; end if;
  delete from public.push_subscriptions; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHA: B removeu o aparelho de A'; end if;
  begin
    insert into public.question_answers(user_id, question_id, choice, correct) values ('a2222222-2222-4222-8222-222222222222', 'q2', 'B', true);
    raise exception 'FALHA: B gravou resposta em nome de A';
  exception when insufficient_privilege then null; end;
end $$;
select 'OK  0011/0015/0016: respostas, cronograma e avisos isolados por aluno';

-- Aluno inativo não grava nada
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :I, false);
do $$ begin
  begin
    insert into public.question_answers(question_id, choice, correct) values ('q1', 'A', true);
    raise exception 'FALHA: aluno inativo gravou resposta';
  exception when insufficient_privilege then null; end;
end $$;
select 'OK  0015: aluno desativado não grava respostas';

-- Vade Esperto: a equipe publica; aluno ativo só lê
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :E, false);
insert into public.vade_esperto(slug, versao) values ('processo-penal', 'atualizado em 14.09.26');
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :A, false);
do $$ declare n int; begin
  select count(*) into n from public.vade_esperto; if n <> 1 then raise exception 'FALHA: aluno vê % Vade Espertos', n; end if;
  update public.vade_esperto set versao = 'x'; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHA: aluno alterou o Vade Esperto'; end if;
  begin
    insert into public.vade_esperto(slug) values ('penal');
    raise exception 'FALHA: aluno publicou Vade Esperto';
  exception when insufficient_privilege then null; end;
end $$;
reset role; set role authenticated; select set_config('request.jwt.claim.sub', :I, false);
do $$ declare n int; begin
  select count(*) into n from public.vade_esperto; if n <> 0 then raise exception 'FALHA: aluno inativo vê o Vade Esperto'; end if;
end $$;
select 'OK  0017: Vade Esperto publicado pela equipe, lido só por aluno ativo';
reset role;
