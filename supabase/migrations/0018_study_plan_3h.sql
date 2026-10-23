-- Cronograma oficial de 3h por dia, além dos de 4h e 6h.
alter table public.study_plan_choices drop constraint if exists study_plan_choices_plano_check;
alter table public.study_plan_choices add constraint study_plan_choices_plano_check check (plano in ('3h', '4h', '6h', 'proprio'));
