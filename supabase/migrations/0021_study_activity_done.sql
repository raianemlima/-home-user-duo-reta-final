-- Atividades do cronograma que o aluno marcou como concluídas, uma linha por dia e atividade.
-- O cronograma oficial se repete toda semana: "dia" é a data em que o aluno fez a atividade (ex.: a segunda-feira
-- desta semana), e "atividade" é o título dela no cronograma ("Trilha de Direito Penal").
create table if not exists public.study_activity_done (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dia date not null,
  atividade text not null check (char_length(atividade) between 1 and 200),
  done_at timestamptz not null default now(),
  primary key (user_id, dia, atividade)
);
alter table public.study_activity_done enable row level security;
create policy study_activity_done_own on public.study_activity_done for all
  using (user_id = (select auth.uid()) and (select public.is_active_student()))
  with check (user_id = (select auth.uid()) and (select public.is_active_student()));
