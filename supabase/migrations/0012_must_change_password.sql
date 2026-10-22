-- Alunos criados com a senha padrão precisam trocá-la no primeiro acesso.
alter table public.profiles add column if not exists must_change_password boolean not null default false;
