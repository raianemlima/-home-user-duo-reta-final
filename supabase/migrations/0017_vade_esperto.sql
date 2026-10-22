-- Vade Esperto: um PDF por matéria no bucket privado "vade-esperto" (<slug>.pdf), enviado pela equipe pelo app.
-- O aluno abre por URL assinada gerada no servidor; a tabela guarda a data de atualização que aparece na tela.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vade-esperto', 'vade-esperto', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.vade_esperto (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  versao text not null default '' check (char_length(versao) <= 80),
  updated_at timestamptz not null default now()
);
alter table public.vade_esperto enable row level security;
create policy vade_esperto_read on public.vade_esperto for select using ((select public.is_active_student()));
create policy vade_esperto_staff on public.vade_esperto for all using ((select public.is_staff())) with check ((select public.is_staff()));
