-- Limite de uso das operações pesadas, por aluno e em janelas fixas: o PDF protegido (gerado a cada download) e a
-- exportação do caderno. Os limites ficam aqui, não com quem chama: chamando a função pela API, o aluno só gasta a
-- própria cota, sem conseguir afrouxá-la nem zerá-la.
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null default now(),
  hits integer not null default 0,
  primary key (user_id, bucket)
);
-- Sem políticas: ninguém lê nem grava a tabela pela API; só a função abaixo.
alter table public.rate_limits enable row level security;

create or replace function public.take_rate_limit(p_bucket text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  max_hits integer;
  window_seconds integer;
  allowed boolean;
begin
  if uid is null then return false; end if;
  case p_bucket
    when 'pdf' then max_hits := 30; window_seconds := 600;
    when 'export' then max_hits := 10; window_seconds := 600;
    else raise exception 'unknown_bucket' using errcode = '22023';
  end case;
  insert into public.rate_limits as r (user_id, bucket, window_start, hits) values (uid, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update set
    window_start = case when r.window_start <= now() - make_interval(secs => window_seconds) then now() else r.window_start end,
    hits = case when r.window_start <= now() - make_interval(secs => window_seconds) then 1 else r.hits + 1 end
  returning hits <= max_hits into allowed;
  return allowed;
end $$;
revoke execute on function public.take_rate_limit(text) from public, anon;
grant execute on function public.take_rate_limit(text) to authenticated, service_role;
