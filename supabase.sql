-- Execute este SQL UMA VEZ no SQL Editor do seu projeto Supabase.
-- A tabela guarda o estado do Linka em uma única linha JSON.
create table if not exists public.linka_state (
  id integer primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- O Linka usa a chave SERVICE_ROLE somente no servidor Render.
-- Não coloque essa chave no app/site nem no código público.
alter table public.linka_state enable row level security;
