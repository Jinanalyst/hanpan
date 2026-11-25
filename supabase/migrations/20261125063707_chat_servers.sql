-- Player-made chat servers. People are invited by wallet address and decide themselves whether to join.
-- Browsers may only read messages of servers they belong to. Every change goes through the functions below,
-- which take the caller's wallet from the verified login, never from the browser.

create table public.chat_servers (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 2 and 32),
  about      text not null default '' check (char_length(about) <= 120),
  color      smallint not null default 0 check (color between 0 and 5),
  created_at timestamptz not null default now()
);
create index chat_servers_owner on public.chat_servers (owner_id);

create table public.chat_members (
  server_id uuid not null references public.chat_servers (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  wallet    text not null,
  nick      text not null default '',
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
create index chat_members_user on public.chat_members (user_id);

-- Kept by wallet, so friends can be invited before their first login.
create table public.chat_invites (
  server_id  uuid not null references public.chat_servers (id) on delete cascade,
  wallet     text not null check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  created_at timestamptz not null default now(),
  primary key (server_id, wallet)
);
create index chat_invites_wallet on public.chat_invites (wallet);

-- Someone who said no is left alone for a week, even if the server is deleted and made again.
create table public.chat_declines (
  inviter_id uuid not null references auth.users (id) on delete cascade,
  wallet     text not null,
  at         timestamptz not null default now(),
  primary key (inviter_id, wallet)
);

create table public.chat_messages (
  id         bigint generated always as identity primary key,
  server_id  uuid not null references public.chat_servers (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null,
  wallet     text not null,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index chat_messages_server on public.chat_messages (server_id, id desc);
create index chat_messages_user on public.chat_messages (user_id, created_at desc);

alter table public.chat_servers  enable row level security;
alter table public.chat_members  enable row level security;
alter table public.chat_invites  enable row level security;
alter table public.chat_declines enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_servers, public.chat_members, public.chat_invites, public.chat_declines, public.chat_messages from anon, authenticated;
grant all on public.chat_servers, public.chat_members, public.chat_invites, public.chat_declines, public.chat_messages to service_role;

/* ---- helpers: outside the API schema ---- */
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.chat_member(p_server uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_members where server_id = p_server and user_id = auth.uid());
$$;

create function private.chat_owner(p_server uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_servers where id = p_server and owner_id = auth.uid());
$$;

-- The caller's Solana wallet. auth.identities cannot be edited by users (user metadata can).
create function private.chat_wallet() returns text
language plpgsql stable security definer set search_path = '' as $$
declare w text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select split_part(provider_id, ':', 3) into w from auth.identities
   where user_id = auth.uid() and provider = 'web3' and provider_id like 'web3:solana:%' order by created_at limit 1;
  if w is null then raise exception 'no_wallet'; end if;
  return w;
end $$;

-- One line of plain text: no control, zero-width or text-direction characters.
create function private.chat_line(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(coalesce(p, ''), '[\u0001- \u007f- ​‎‏  ‪-‮⁦-⁩﻿]+', ' ', 'g'));
$$;
create function private.chat_nick(p text) returns text
language sql immutable set search_path = '' as $$ select btrim(left(private.chat_line(p), 16)); $$;

-- This file's own helpers only: nothing else in the schema is touched.
revoke execute on function private.chat_member(uuid), private.chat_owner(uuid), private.chat_wallet(),
  private.chat_line(text), private.chat_nick(text) from public, anon, authenticated;
grant execute on function private.chat_member(uuid) to authenticated;   -- used by the row rule below

grant select on public.chat_messages to authenticated;
create policy "members read messages" on public.chat_messages for select to authenticated using (private.chat_member(server_id));

/* ---- reading ---- */
-- My wallet, my servers, and invitations waiting for me.
create function public.chat_home() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare w text := private.chat_wallet();
begin
  return jsonb_build_object(
    'wallet', w,
    'servers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'about', s.about, 'color', s.color,
        'mine', s.owner_id = auth.uid(), 'members', (select count(*) from public.chat_members x where x.server_id = s.id),
        'last', (select max(x.id) from public.chat_messages x where x.server_id = s.id)) order by m.joined_at)
      from public.chat_members m join public.chat_servers s on s.id = m.server_id where m.user_id = auth.uid()), '[]'),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'color', s.color,
        'from', o.wallet, 'nick', o.nick) order by i.created_at)
      from public.chat_invites i join public.chat_servers s on s.id = i.server_id
      join public.chat_members o on o.server_id = s.id and o.user_id = s.owner_id where i.wallet = w), '[]'));
end $$;

-- People in one server. Waiting invitations are shown to the owner only.
create function public.chat_people(p_server uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.chat_member(p_server) then raise exception 'not_member'; end if;
  return jsonb_build_object(
    'members', (select jsonb_agg(jsonb_build_object('user', m.user_id, 'wallet', m.wallet, 'nick', m.nick,
        'owner', m.user_id = s.owner_id, 'me', m.user_id = auth.uid()) order by m.user_id <> s.owner_id, m.joined_at)
      from public.chat_members m join public.chat_servers s on s.id = m.server_id where m.server_id = p_server),
    'invites', case when private.chat_owner(p_server) then coalesce((select jsonb_agg(wallet order by created_at)
      from public.chat_invites where server_id = p_server), '[]') else '[]' end);
end $$;

/* ---- servers ---- */
create function public.chat_create(p_name text, p_about text, p_color int, p_nick text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare w text := private.chat_wallet(); n text := private.chat_line(p_name); a text := private.chat_line(p_about); sid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('chat:' || auth.uid()::text, 0));   -- one at a time per player
  if char_length(n) not between 2 and 32 or char_length(a) > 120 or coalesce(p_color, 0) not between 0 and 5 then raise exception 'bad_name'; end if;
  if (select count(*) from public.chat_servers where owner_id = auth.uid()) >= 5 then raise exception 'too_many_owned'; end if;
  if (select count(*) from public.chat_members where user_id = auth.uid()) >= 30 then raise exception 'too_many_joined'; end if;
  insert into public.chat_servers (owner_id, name, about, color) values (auth.uid(), n, a, coalesce(p_color, 0)) returning id into sid;
  insert into public.chat_members (server_id, user_id, wallet, nick) values (sid, auth.uid(), w, private.chat_nick(p_nick));
  return sid;
end $$;

create function public.chat_edit(p_server uuid, p_name text, p_about text, p_color int) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := private.chat_line(p_name); a text := private.chat_line(p_about);
begin
  if not private.chat_owner(p_server) then raise exception 'not_owner'; end if;
  if char_length(n) not between 2 and 32 or char_length(a) > 120 or coalesce(p_color, 0) not between 0 and 5 then raise exception 'bad_name'; end if;
  update public.chat_servers set name = n, about = a, color = coalesce(p_color, 0) where id = p_server;
end $$;

create function public.chat_delete(p_server uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.chat_owner(p_server) then raise exception 'not_owner'; end if;
  delete from public.chat_servers where id = p_server;
end $$;

/* ---- people ---- */
-- The answer is the same whether or not the wallet has ever logged in here.
create function public.chat_invite(p_server uuid, p_wallet text) returns void
language plpgsql security definer set search_path = '' as $$
declare w text := btrim(coalesce(p_wallet, ''));
begin
  if not private.chat_owner(p_server) then raise exception 'not_owner'; end if;
  if w !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then raise exception 'bad_wallet'; end if;
  perform 1 from public.chat_servers where id = p_server for update;   -- one at a time per server
  if exists (select 1 from public.chat_members where server_id = p_server and wallet = w) then raise exception 'already_member'; end if;
  if exists (select 1 from public.chat_invites where server_id = p_server and wallet = w) then raise exception 'already_invited'; end if;
  if exists (select 1 from public.chat_declines where inviter_id = auth.uid() and wallet = w and at > now() - interval '7 days') then raise exception 'declined'; end if;
  if (select count(*) from public.chat_members where server_id = p_server) + (select count(*) from public.chat_invites where server_id = p_server) >= 50 then raise exception 'server_full'; end if;
  insert into public.chat_invites (server_id, wallet) values (p_server, w);
end $$;

create function public.chat_uninvite(p_server uuid, p_wallet text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.chat_owner(p_server) then raise exception 'not_owner'; end if;
  delete from public.chat_invites where server_id = p_server and wallet = p_wallet;
end $$;

create function public.chat_accept(p_server uuid, p_nick text) returns void
language plpgsql security definer set search_path = '' as $$
declare w text := private.chat_wallet();
begin
  perform pg_advisory_xact_lock(hashtextextended('chat:' || auth.uid()::text, 0));
  if (select count(*) from public.chat_members where user_id = auth.uid()) >= 30 then raise exception 'too_many_joined'; end if;
  delete from public.chat_invites where server_id = p_server and wallet = w;
  if not found then raise exception 'no_invite'; end if;
  insert into public.chat_members (server_id, user_id, wallet, nick) values (p_server, auth.uid(), w, private.chat_nick(p_nick)) on conflict do nothing;
end $$;

create function public.chat_decline(p_server uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare w text := private.chat_wallet();
begin
  delete from public.chat_invites where server_id = p_server and wallet = w;
  if found then
    insert into public.chat_declines (inviter_id, wallet) select owner_id, w from public.chat_servers where id = p_server
      on conflict (inviter_id, wallet) do update set at = now();
  end if;
end $$;

create function public.chat_remove(p_server uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.chat_owner(p_server) then raise exception 'not_owner'; end if;
  if p_user = auth.uid() then raise exception 'owner_stays'; end if;
  delete from public.chat_members where server_id = p_server and user_id = p_user;
end $$;

create function public.chat_leave(p_server uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.chat_owner(p_server) then raise exception 'owner_stays'; end if;
  delete from public.chat_members where server_id = p_server and user_id = auth.uid();
end $$;

create function public.chat_rename_me(p_server uuid, p_nick text) returns void
language sql security definer set search_path = '' as $$
  update public.chat_members set nick = private.chat_nick(p_nick) where server_id = p_server and user_id = auth.uid();
$$;

/* ---- messages ---- */
create function public.chat_post(p_server uuid, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare w text := private.chat_wallet(); b text := private.chat_line(p_body); mid bigint;
begin
  if not private.chat_member(p_server) then raise exception 'not_member'; end if;
  if char_length(b) not between 1 and 500 then raise exception 'bad_message'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chat:' || auth.uid()::text, 0));
  if (select count(*) from public.chat_messages where user_id = auth.uid() and created_at > now() - interval '10 seconds') >= 6 then raise exception 'too_fast'; end if;
  insert into public.chat_messages (server_id, user_id, wallet, body) values (p_server, auth.uid(), w, b) returning id into mid;
  return mid;
end $$;

-- Your own message, or any message in a server you own.
create function public.chat_unpost(p_message bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.chat_messages where id = p_message and (private.chat_owner(server_id) or (user_id = auth.uid() and private.chat_member(server_id)));
  if not found then raise exception 'not_allowed'; end if;
end $$;

-- Signed-in players only. Each function checks for itself what the caller may do.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in
    ('chat_home', 'chat_people', 'chat_create', 'chat_edit', 'chat_delete', 'chat_invite', 'chat_uninvite', 'chat_accept',
     'chat_decline', 'chat_remove', 'chat_leave', 'chat_rename_me', 'chat_post', 'chat_unpost')
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- New messages are announced live, under the same row rule.
alter publication supabase_realtime add table public.chat_messages;
