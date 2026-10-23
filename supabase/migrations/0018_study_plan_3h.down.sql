update public.study_plan_choices set plano = '4h' where plano = '3h';
alter table public.study_plan_choices drop constraint if exists study_plan_choices_plano_check;
alter table public.study_plan_choices add constraint study_plan_choices_plano_check check (plano in ('4h', '6h', 'proprio'));
