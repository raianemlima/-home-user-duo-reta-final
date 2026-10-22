-- Avisos no celular (Web Push): uma linha por aparelho. O aluno só enxerga e altera as próprias; o envio usa a chave de serviço.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all
  using (user_id = auth.uid() and public.is_active_student()) with check (user_id = auth.uid() and public.is_active_student());
