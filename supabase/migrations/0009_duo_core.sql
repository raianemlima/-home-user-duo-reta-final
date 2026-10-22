-- App DUO: perfis de acesso, conteúdo publicado em versões imutáveis, grifos e posição de leitura.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null default '',
  role text not null default 'aluno' check (role in ('equipe', 'aluno')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Funções de papel: security definer para que as políticas consultem profiles sem recursão de RLS.
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'equipe' and active)
$$;
create or replace function public.is_active_student() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and active)
$$;

create table if not exists public.disciplines (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 200),
  position int not null default 0
);

create table if not exists public.content_versions (
  id uuid primary key default gen_random_uuid(),
  discipline_id uuid not null references public.disciplines(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  source_sha256 text not null,
  job_id uuid null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  published_at timestamptz null
);
create unique index if not exists one_published_per_discipline on public.content_versions (discipline_id) where status = 'published';

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.content_versions(id) on delete cascade,
  position int not null,
  level int not null,
  numbering text null,
  title text null,
  path text[] not null default '{}'
);
create index if not exists sections_version_idx on public.sections (version_id, position);

create table if not exists public.paragraphs (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  version_id uuid not null references public.content_versions(id) on delete cascade,
  position int not null,
  kind text not null check (kind in ('body', 'table', 'footnote', 'tip')),
  text text not null,
  hash text not null
);
create index if not exists paragraphs_section_idx on public.paragraphs (section_id, position);
create index if not exists paragraphs_version_idx on public.paragraphs (version_id);

create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  discipline_id uuid not null references public.disciplines(id) on delete cascade,
  version_id uuid not null references public.content_versions(id),
  start_paragraph_id uuid not null,
  start_offset int not null check (start_offset >= 0),
  end_paragraph_id uuid not null,
  end_offset int not null check (end_offset >= 0),
  quote text not null check (char_length(quote) between 1 and 20000),
  prefix text not null default '',
  suffix text not null default '',
  color text not null check (color in ('importante', 'lei_seca', 'jurisprudencia', 'revisar')),
  note text null check (char_length(note) <= 2000),
  status text not null default 'active' check (status in ('active', 'orphaned')),
  orphaned_at timestamptz null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists highlights_user_idx on public.highlights (user_id, discipline_id);
create index if not exists highlights_version_idx on public.highlights (version_id) where status = 'active';

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists highlights_touch on public.highlights;
create trigger highlights_touch before update on public.highlights for each row execute function public.touch_updated_at();

create table if not exists public.reading_positions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  discipline_id uuid not null references public.disciplines(id) on delete cascade,
  section_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, discipline_id)
);

alter table public.profiles enable row level security;
alter table public.disciplines enable row level security;
alter table public.content_versions enable row level security;
alter table public.sections enable row level security;
alter table public.paragraphs enable row level security;
alter table public.highlights enable row level security;
alter table public.reading_positions enable row level security;

-- Perfis: cada um lê o próprio; só a equipe cria, altera ou remove.
create policy profiles_select on public.profiles for select using (user_id = auth.uid() or public.is_staff());
create policy profiles_staff_write on public.profiles for all using (public.is_staff()) with check (public.is_staff());

-- Conteúdo: alunos ativos leem só o que está publicado; a equipe lê e escreve tudo.
create policy disciplines_select on public.disciplines for select using (public.is_active_student());
create policy disciplines_staff_write on public.disciplines for all using (public.is_staff()) with check (public.is_staff());
create policy versions_select on public.content_versions for select using (public.is_staff() or (status = 'published' and public.is_active_student()));
create policy versions_staff_write on public.content_versions for all using (public.is_staff()) with check (public.is_staff());
create policy sections_select on public.sections for select using (public.is_staff() or (public.is_active_student() and exists (select 1 from public.content_versions v where v.id = version_id and v.status = 'published')));
create policy sections_staff_write on public.sections for all using (public.is_staff()) with check (public.is_staff());
create policy paragraphs_select on public.paragraphs for select using (public.is_staff() or (public.is_active_student() and exists (select 1 from public.content_versions v where v.id = version_id and v.status = 'published')));
create policy paragraphs_staff_write on public.paragraphs for all using (public.is_staff()) with check (public.is_staff());

-- Grifos e posição de leitura: só o próprio aluno, e só enquanto ativo.
create policy highlights_own on public.highlights for all using (user_id = auth.uid() and public.is_active_student()) with check (user_id = auth.uid() and public.is_active_student());
create policy reading_positions_own on public.reading_positions for all using (user_id = auth.uid() and public.is_active_student()) with check (user_id = auth.uid() and public.is_active_student());

-- Pipeline de ingestão herdado do atelie: só a equipe usa. Políticas restritivas somam-se às de dono já existentes.
do $$ declare t text; begin
  foreach t in array array['projects','sources','chapters','documents','notebooks','notebook_sources','jobs','job_stages','stage_cache','notebook_versions','blocks','thematic_maps'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff())', 'duo_staff_only_' || t, t);
    end if;
  end loop;
end $$;
create policy duo_staff_only_document_objects on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'documents' or public.is_staff()) with check (bucket_id <> 'documents' or public.is_staff());
