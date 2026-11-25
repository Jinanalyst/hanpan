-- HANPAN store. Clients may only read the catalogue and their own rows.
-- Orders and ownership are written only by the "store" Edge Function (service_role).

create table public.products (
  id        text primary key check (id ~ '^(weapon|land):[a-z0-9_]+$'),
  name      text not null,
  price_usd numeric(10, 2) not null check (price_usd > 0),
  active    boolean not null default true
);

create table public.orders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,   -- keep the payment record if the account goes away
  product_id  text not null references public.products (id),
  price_usd   numeric(10, 2) not null,
  -- new: invoice made, pending: payment opened, confirming: seen on chain, paid: item granted,
  -- duplicate: paid but already owned, review: needs a person, plus partial / failed / expired / refunded
  status      text not null default 'new' check (status in
    ('new', 'pending', 'confirming', 'paid', 'duplicate', 'review', 'partial', 'failed', 'expired', 'refunded')),
  invoice_id  text,
  invoice_url text,
  payment_id  text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index orders_user on public.orders (user_id, created_at desc);
create index orders_product on public.orders (product_id);

create table public.entitlements (
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id),
  order_id   uuid references public.orders (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index entitlements_order on public.entitlements (order_id);
create index entitlements_product on public.entitlements (product_id);

-- Every verified payment notice, kept for support and refunds.
create table public.payment_events (
  id          bigint generated always as identity primary key,
  order_id    uuid references public.orders (id),
  payment_id  text,
  status      text,
  payload     jsonb not null,
  received_at timestamptz not null default now()
);
create index payment_events_order on public.payment_events (order_id);

alter table public.products       enable row level security;
alter table public.orders         enable row level security;
alter table public.entitlements   enable row level security;
alter table public.payment_events enable row level security;

revoke all on public.products, public.orders, public.entitlements, public.payment_events from anon, authenticated;
grant select on public.products to anon, authenticated;
grant select (id, product_id, price_usd, status, created_at, updated_at) on public.orders to authenticated;
grant select on public.entitlements to authenticated;
grant all on public.products, public.orders, public.entitlements, public.payment_events to service_role;

create policy "catalogue is public" on public.products for select to anon, authenticated using (active);
create policy "read own orders" on public.orders for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own items" on public.entitlements for select to authenticated using ((select auth.uid()) = user_id);

-- Starts (or reuses) an order. The price always comes from the catalogue, never from the browser.
create function public.start_order(p_user uuid, p_product text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  item public.products;
  o    public.orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));   -- one at a time per player
  select * into item from public.products where id = p_product and active;
  if not found then return jsonb_build_object('error', 'unknown_product'); end if;
  if exists (select 1 from public.entitlements where user_id = p_user and product_id = p_product) then
    return jsonb_build_object('error', 'owned');
  end if;
  -- an unfinished order is reused so nobody pays twice for one item
  select * into o from public.orders
   where user_id = p_user and product_id = p_product and invoice_url is not null
     and ((status in ('new', 'pending') and price_usd = item.price_usd and created_at > now() - interval '1 hour')
       or (status in ('confirming', 'partial', 'review') and created_at > now() - interval '7 days'))
   order by created_at desc limit 1;
  if found then
    return jsonb_build_object('order_id', o.id, 'status', o.status, 'invoice_url', o.invoice_url);
  end if;
  if (select count(*) from public.orders where user_id = p_user and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'too_many_orders');
  end if;
  insert into public.orders (user_id, product_id, price_usd) values (p_user, p_product, item.price_usd) returning * into o;
  return jsonb_build_object('order_id', o.id, 'status', o.status, 'price_usd', o.price_usd, 'name', item.name);
end $$;

-- Applies one verified payment notice. Safe to call again with the same notice.
create function public.apply_payment(p_order uuid, p_payload jsonb) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  o    public.orders;
  st   text := p_payload ->> 'payment_status';
  pid  text := p_payload ->> 'payment_id';
  new_status text;
  why  text;
begin
  select * into o from public.orders where id = p_order for update;
  insert into public.payment_events (order_id, payment_id, status, payload) values (o.id, pid, st, p_payload);
  if o.id is null then return 'unknown_order'; end if;

  if st = 'refunded' then
    if o.payment_id is not null and o.payment_id is distinct from pid then   -- a refund of some other payment
      update public.orders set note = 'another payment was refunded: ' || coalesce(pid, '?'), updated_at = now() where id = o.id;
      return o.status;
    end if;
    delete from public.entitlements where order_id = o.id;
    new_status := 'refunded';
  elsif o.status in ('paid', 'duplicate', 'refunded', 'review') then          -- settled: never downgraded by late notices
    if st = 'finished' and o.payment_id is distinct from pid then
      update public.orders set note = 'extra payment received: ' || coalesce(pid, '?'), updated_at = now() where id = o.id;
    end if;
    return o.status;
  elsif st = 'finished' then
    if (p_payload ->> 'price_amount')::numeric is distinct from o.price_usd
       or lower(coalesce(p_payload ->> 'price_currency', '')) <> 'usd' then
      new_status := 'review'; why := 'price does not match the order';
    elsif nullif(p_payload ->> 'parent_payment_id', '') is not null then
      new_status := 'review'; why := 'repeated deposit';
    elsif o.user_id is null then
      new_status := 'review'; why := 'account no longer exists';
    else
      insert into public.entitlements (user_id, product_id, order_id) values (o.user_id, o.product_id, o.id) on conflict do nothing;
      if found then new_status := 'paid'; else new_status := 'duplicate'; why := 'item was already owned'; end if;
    end if;
  else
    new_status := case st when 'waiting' then 'pending' when 'confirming' then 'confirming' when 'confirmed' then 'confirming'
                    when 'sending' then 'confirming' when 'partially_paid' then 'partial'
                    when 'failed' then 'failed' when 'expired' then 'expired' end;
    if new_status is null then return o.status; end if;
    -- an abandoned second attempt must not hide a payment that is already on its way
    if o.status in ('confirming', 'partial') and o.payment_id is distinct from pid and new_status in ('pending', 'expired', 'failed') then return o.status; end if;
    if o.status = 'confirming' and new_status = 'pending' then return o.status; end if;
  end if;

  update public.orders set status = new_status, payment_id = coalesce(pid, o.payment_id), note = coalesce(why, o.note), updated_at = now() where id = o.id;
  return new_status;
end $$;

revoke execute on function public.start_order(uuid, text), public.apply_payment(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.start_order(uuid, text), public.apply_payment(uuid, jsonb) to service_role;

-- Prices are yours to change any time: update public.products set price_usd = ... where id = ...
insert into public.products (id, name, price_usd) values
  ('weapon:smg',     'Hornet SMG',      4.99),
  ('weapon:shotgun', 'Breaker Shotgun', 4.99),
  ('weapon:dmr',     'Longbow DMR',     4.99),
  ('weapon:lmg',     'Anvil LMG',       4.99),
  ('land:orbital',   'Orbital Dock',    6.99),
  ('land:foundry',   'Ember Foundry',   6.99),
  ('land:palace',    'Blossom Palace',  6.99);
