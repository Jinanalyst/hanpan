-- Servers for players without a wallet. A guest signs in anonymously and gets a friend code
-- (XXXX-XXXX, no I, O, 0 or 1) that stands in for a wallet address: friends invite it the same way.
-- Everything else (who may read, write, invite) works exactly as for wallet players.

create table public.chat_guests (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  created_at timestamptz not null default now()
);
alter table public.chat_guests enable row level security;
revoke all on public.chat_guests from anon, authenticated;
grant all on public.chat_guests to service_role;

-- Invitations go to a wallet address or a friend code.
alter table public.chat_invites drop constraint chat_invites_wallet_check;
alter table public.chat_invites add constraint chat_invites_wallet_check
  check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' or wallet ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$');

-- The caller's Solana wallet, or else their friend code. Neither can be edited by the player.
create or replace function private.chat_wallet() returns text
language plpgsql stable security definer set search_path = '' as $$
declare w text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select split_part(provider_id, ':', 3) into w from auth.identities
   where user_id = auth.uid() and provider = 'web3' and provider_id like 'web3:solana:%' order by created_at limit 1;
  if w is null then select code into w from public.chat_guests where user_id = auth.uid(); end if;
  if w is null then raise exception 'no_wallet'; end if;
  return w;
end $$;
revoke execute on function private.chat_wallet() from public, anon, authenticated;

-- Gives a player without a wallet their friend code, made once. Wallet players get their address.
create function public.chat_guest() returns text
language plpgsql security definer set search_path = '' as $$
declare abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; c text; k int;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from auth.identities where user_id = auth.uid() and provider = 'web3') then return private.chat_wallet(); end if;
  for tries in 1..8 loop
    select code into c from public.chat_guests where user_id = auth.uid();
    if c is not null then return c; end if;
    b := uuid_send(gen_random_uuid());
    c := '';
    foreach k in array array[0, 1, 2, 3, 4, 5, 10, 11] loop   -- random bytes only, not the uuid version bits
      c := c || substr(abc, 1 + get_byte(b, k) % 32, 1);
      if char_length(c) = 4 then c := c || '-'; end if;
    end loop;
    insert into public.chat_guests (user_id, code) values (auth.uid(), c) on conflict do nothing;
  end loop;
  raise exception 'try_again';
end $$;

-- Same as before, but a friend code is accepted too (in any letter case).
create or replace function public.chat_invite(p_server uuid, p_wallet text) returns void
language plpgsql security definer set search_path = '' as $$
declare w text := btrim(coalesce(p_wallet, ''));
begin
  if not private.chat_owner(p_server) then raise exception 'not_owner'; end if;
  if upper(w) ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' then w := upper(w);
  elsif w !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then raise exception 'bad_wallet'; end if;
  perform 1 from public.chat_servers where id = p_server for update;   -- one at a time per server
  if exists (select 1 from public.chat_members where server_id = p_server and wallet = w) then raise exception 'already_member'; end if;
  if exists (select 1 from public.chat_invites where server_id = p_server and wallet = w) then raise exception 'already_invited'; end if;
  if exists (select 1 from public.chat_declines where inviter_id = auth.uid() and wallet = w and at > now() - interval '7 days') then raise exception 'declined'; end if;
  if (select count(*) from public.chat_members where server_id = p_server) + (select count(*) from public.chat_invites where server_id = p_server) >= 50 then raise exception 'server_full'; end if;
  insert into public.chat_invites (server_id, wallet) values (p_server, w);
end $$;

revoke execute on function public.chat_guest() from public, anon;
grant execute on function public.chat_guest() to authenticated;   -- anonymous logins have this role too
revoke execute on function public.chat_invite(uuid, text) from public, anon;
grant execute on function public.chat_invite(uuid, text) to authenticated;
