-- ============================================================
-- 9 Digitals Solutions — WhatsApp Agent
-- Supabase SQL Editor: paste and Run (one block is OK)
--
-- If something fails, run each section separately (marked below).
-- ============================================================

-- ── SECTION 1: Tables (run this first) ──────────────────────

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
  created_at timestamptz default now()
);

-- Add assistant_source if messages table existed from an older script
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'assistant_source'
  ) then
    alter table public.messages
      add column assistant_source text check (assistant_source in ('ai', 'human'));
  end if;
end $$;

create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_conversations_updated on public.conversations(updated_at desc);

-- ── SECTION 2: Permissions (API + Realtime) ─────────────────

grant usage on schema public to anon, authenticated, service_role;

grant all on public.conversations to service_role;
grant all on public.messages to service_role;

grant select on public.conversations to anon, authenticated;
grant select on public.messages to anon, authenticated;

-- Required for Supabase Realtime to stream changes
grant select on public.conversations to supabase_realtime;
grant select on public.messages to supabase_realtime;

-- ── SECTION 3: Row Level Security (dashboard Realtime) ─────

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "anon_read_conversations" on public.conversations;
create policy "anon_read_conversations"
  on public.conversations for select to anon using (true);

drop policy if exists "anon_read_messages" on public.messages;
create policy "anon_read_messages"
  on public.messages for select to anon using (true);

drop policy if exists "authenticated_read_conversations" on public.conversations;
create policy "authenticated_read_conversations"
  on public.conversations for select to authenticated using (true);

drop policy if exists "authenticated_read_messages" on public.messages;
create policy "authenticated_read_messages"
  on public.messages for select to authenticated using (true);

-- ── SECTION 4: Realtime publication (safe — skips if already added) ──

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

-- ── SECTION 5: Verify ───────────────────────────────────────

select 'OK: conversations table' as status, count(*)::text as row_count from public.conversations
union all
select 'OK: messages table', count(*)::text from public.messages;

select tablename as realtime_enabled
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('conversations', 'messages');
