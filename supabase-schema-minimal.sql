-- MINIMAL SETUP — use this if the full script still fails.
-- Run in Supabase SQL Editor only SECTION 1, then test the app.

create table if not exists public.conversations (
  id uuid default gen_random_uuid() primary key,
  phone text unique not null,
  name text,
  mode text not null default 'agent' check (mode in ('agent', 'human')),
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  whatsapp_msg_id text unique,
  assistant_source text check (assistant_source in ('ai', 'human')),
  created_at timestamptz default now()
);

create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_conversations_updated on public.conversations(updated_at desc);

grant usage on schema public to anon, authenticated, service_role;
grant all on public.conversations to service_role;
grant all on public.messages to service_role;

select 'tables ready' as status;
