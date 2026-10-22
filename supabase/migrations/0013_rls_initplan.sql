-- Desempenho das regras de acesso: `(select auth.uid())` e `(select public.is_staff())` são avaliados uma vez por consulta,
-- e não uma vez por linha (aviso "auth_rls_initplan" do Supabase). O significado das regras não muda.
alter policy highlights_own on public.highlights
  using (user_id = (select auth.uid()) and (select public.is_active_student()))
  with check (user_id = (select auth.uid()) and (select public.is_active_student()));
alter policy reading_positions_own on public.reading_positions
  using (user_id = (select auth.uid()) and (select public.is_active_student()))
  with check (user_id = (select auth.uid()) and (select public.is_active_student()));
alter policy push_subscriptions_own on public.push_subscriptions
  using (user_id = (select auth.uid()) and (select public.is_active_student()))
  with check (user_id = (select auth.uid()) and (select public.is_active_student()));
alter policy profiles_select on public.profiles
  using (user_id = (select auth.uid()) or (select public.is_staff()));

alter policy "owner projects" on public.projects
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy "owner sources" on public.sources
  using (owner_id = (select auth.uid()) and (project_id is null or project_id in (select p.id from public.projects p where p.owner_id = (select auth.uid()))))
  with check (owner_id = (select auth.uid()) and (project_id is null or project_id in (select p.id from public.projects p where p.owner_id = (select auth.uid()))));
alter policy "owner chapters" on public.chapters
  using (owner_id = (select auth.uid()) and (project_id is null or project_id in (select p.id from public.projects p where p.owner_id = (select auth.uid()))))
  with check (owner_id = (select auth.uid()) and (project_id is null or project_id in (select p.id from public.projects p where p.owner_id = (select auth.uid()))));
alter policy "owner documents" on public.documents
  using (owner_id = (select auth.uid()) and (project_id is null or project_id in (select p.id from public.projects p where p.owner_id = (select auth.uid()))))
  with check (owner_id = (select auth.uid()) and (project_id is null or project_id in (select p.id from public.projects p where p.owner_id = (select auth.uid()))));
