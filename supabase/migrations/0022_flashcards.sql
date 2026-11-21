-- Flashcards do aluno (estilo Anki), criados a partir de trechos dos ebooks publicados.
-- O cartão guarda uma CÓPIA do trecho ("texto"): não muda nem some quando o ebook é republicado. "section_id" só serve
-- para o link "Ver no material" enquanto a seção existir (sem chave estrangeira: seções são recriadas a cada publicação).
-- Agenda: "due_on" é o dia (calendário de Brasília) em que o cartão volta; intervalo, facilidade, acertos e lapsos
-- seguem uma simplificação do algoritmo do Anki, calculada no servidor do app.
create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  discipline_id uuid null references public.disciplines(id) on delete set null,
  section_id uuid null,
  origem text not null default '' check (char_length(origem) <= 300),
  tipo text not null check (tipo in ('lacuna', 'pergunta')),
  texto text not null check (char_length(texto) between 1 and 1500),
  pergunta text null check (pergunta is null or char_length(pergunta) between 1 and 300),
  lacunas jsonb not null default '[]'::jsonb check (jsonb_typeof(lacunas) = 'array'),
  due_on date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  interval_days int not null default 0 check (interval_days between 0 and 3650),
  ease numeric(4,2) not null default 2.5 check (ease between 1.3 and 3),
  reps int not null default 0 check (reps >= 0),
  lapses int not null default 0 check (lapses >= 0),
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flashcards_formato check (
    (tipo = 'pergunta' and pergunta is not null) or (tipo = 'lacuna' and jsonb_array_length(lacunas) > 0)
  )
);
create index if not exists flashcards_user_due_idx on public.flashcards (user_id, due_on);
create index if not exists flashcards_discipline_idx on public.flashcards (discipline_id);
drop trigger if exists flashcards_touch on public.flashcards;
create trigger flashcards_touch before update on public.flashcards for each row execute function public.touch_updated_at();
alter table public.flashcards enable row level security;
create policy flashcards_own on public.flashcards for all
  using (user_id = (select auth.uid()) and (select public.is_active_student()))
  with check (user_id = (select auth.uid()) and (select public.is_active_student()));
