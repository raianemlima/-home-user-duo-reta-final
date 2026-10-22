-- Qual cronograma o aluno segue: um dos cronogramas oficiais do DUO (4h ou 6h por dia) ou o arquivo que ele enviou.
-- Os oficiais ficam no bucket "cronogramas", pasta "oficiais/", enviados pela equipe; o do aluno, na pasta com o id dele.
create table if not exists public.study_plan_choices (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  plano text not null check (plano in ('4h', '6h', 'proprio')),
  updated_at timestamptz not null default now()
);
alter table public.study_plan_choices enable row level security;
create policy study_plan_choices_own on public.study_plan_choices for all
  using (user_id = (select auth.uid()) and (select public.is_active_student()))
  with check (user_id = (select auth.uid()) and (select public.is_active_student()));
