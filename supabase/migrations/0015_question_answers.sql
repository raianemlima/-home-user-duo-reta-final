-- Banco de questões: a última resposta de cada aluno em cada questão (o banco em si fica no app, em data/questoes.json).
create table if not exists public.question_answers (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id text not null check (char_length(question_id) between 1 and 120),
  choice text not null check (choice in ('A', 'B', 'C', 'D', 'E')),
  correct boolean not null,
  answered_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
alter table public.question_answers enable row level security;
create policy question_answers_own on public.question_answers for all
  using (user_id = (select auth.uid()) and (select public.is_active_student()))
  with check (user_id = (select auth.uid()) and (select public.is_active_student()));
