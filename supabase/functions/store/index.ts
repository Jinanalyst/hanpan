// HANPAN store payments.
//   POST /store/checkout  signed-in player asks to buy a product -> NOWPayments invoice link
//   POST /store/ipn       NOWPayments payment notice (signed) -> order update and item grant
// Secrets (Supabase dashboard > Edge Functions > Secrets): NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET
// Deploy with verify_jwt off: checkout verifies the player's token itself and the notice carries its own signature.

const env = (k: string) => Deno.env.get(k) || '';
const SB = env('SUPABASE_URL');
const keyFrom = (json: string, legacy: string) => {
  try { const k = JSON.parse(env(json)).default; if (k) return k as string; } catch { /* not set */ }
  return env(legacy);
};
const PUBLIC_KEY = keyFrom('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const SECRET_KEY = keyFrom('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const NP = env('NOWPAYMENTS_API_BASE') || 'https://api.nowpayments.io';
const ORIGINS = (env('STORE_ORIGINS') || 'https://hanpan.team,http://localhost:3000').split(',');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const soon = () => AbortSignal.timeout(10000);

// Database access as service_role. New secret keys go in the apikey header only; legacy ones are JWTs.
async function db(method: string, path: string, body: unknown) {
  const headers: Record<string, string> = { apikey: SECRET_KEY, 'content-type': 'application/json' };
  if (SECRET_KEY.startsWith('eyJ')) headers.authorization = 'Bearer ' + SECRET_KEY;
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers, body: JSON.stringify(body), signal: soon() });
  if (!r.ok) throw new Error(`database ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : await r.json().catch(() => null);
}
const rpc = (name: string, args: unknown) => db('POST', 'rpc/' + name, args);

async function checkout(req: Request) {
  const apiKey = env('NOWPAYMENTS_API_KEY');
  if (!apiKey || !env('NOWPAYMENTS_IPN_SECRET')) return reply(503, { error: 'store_closed' });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const who = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: PUBLIC_KEY, authorization: 'Bearer ' + token }, signal: soon() });
  if (!who.ok) return reply(401, { error: 'not_signed_in' });
  const user = await who.json();
  if (!UUID.test(user?.id || '')) return reply(401, { error: 'not_signed_in' });

  const body = await req.json().catch(() => null);
  if (typeof body?.product !== 'string' || body.product.length > 64) return reply(400, { error: 'unknown_product' });
  const o = await rpc('start_order', { p_user: user.id, p_product: body.product });
  if (o.error) return reply(o.error === 'too_many_orders' ? 429 : 409, { error: o.error });
  if (o.invoice_url) return reply(200, o);

  const origin = ORIGINS.includes(req.headers.get('origin') || '') ? req.headers.get('origin') : ORIGINS[0];
  const back = `${origin}/store.html?order=${o.order_id}`;
  const r = await fetch(NP + '/v1/invoice', {
    method: 'POST', headers: { 'x-api-key': apiKey, 'content-type': 'application/json' }, signal: soon(),
    body: JSON.stringify({
      price_amount: Number(o.price_usd), price_currency: 'usd', order_id: o.order_id, order_description: 'HANPAN: ' + o.name,
      ipn_callback_url: SB + '/functions/v1/store/ipn', success_url: back, cancel_url: back, partially_paid_url: back,
    }),
  });
  const inv = await r.json().catch(() => null);
  let url: URL | null = null;
  try { url = new URL(inv.invoice_url); } catch { /* handled below */ }
  if (!r.ok || !url || url.protocol !== 'https:' || !/(^|\.)nowpayments\.io$/.test(url.hostname)) {
    console.error('invoice failed', r.status, JSON.stringify(inv)?.slice(0, 300));
    return reply(502, { error: 'payment_provider' });
  }
  await db('PATCH', 'orders?id=eq.' + o.order_id, { invoice_id: String(inv.id), invoice_url: url.href });
  return reply(200, { order_id: o.order_id, status: 'new', invoice_url: url.href });
}

// deno-lint-ignore no-explicit-any
const sortDeep = (v: any): any => Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortDeep(v[k])])) : v;

async function signed(body: Record<string, unknown>, sigHex: string, secret: string) {
  if (!/^[0-9a-f]{128}$/i.test(sigHex)) return false;
  const sig = Uint8Array.from(sigHex.match(/../g)!, h => parseInt(h, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['verify']);
  // NOWPayments documents sorting by key; their sample filters nested keys, other versions sort them. Either is an HMAC under our secret.
  for (const text of [JSON.stringify(sortDeep(body)), JSON.stringify(body, Object.keys(body).sort())]) {
    if (await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(text))) return true;
  }
  return false;
}

async function ipn(req: Request) {
  const secret = env('NOWPAYMENTS_IPN_SECRET').trim(), apiKey = env('NOWPAYMENTS_API_KEY');
  if (!secret || !apiKey) return reply(503, { error: 'store_closed' });
  const text = await req.text();
  if (text.length > 20000) return reply(413, { error: 'too_large' });
  let m;
  try { m = JSON.parse(text); } catch { return reply(400, { error: 'bad_json' }); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return reply(400, { error: 'bad_json' });
  if (!await signed(m, req.headers.get('x-nowpayments-sig') || '', secret)) return reply(401, { error: 'bad_signature' });
  if (!UUID.test(String(m.order_id || ''))) return reply(200, { ignored: 'not a store order' });

  // Before an item is granted, ask NOWPayments directly that this payment is finished for this order.
  if (m.payment_status === 'finished') {
    const r = await fetch(`${NP}/v1/payment/${encodeURIComponent(String(m.payment_id))}`, { headers: { 'x-api-key': apiKey }, signal: soon() });
    if (!r.ok) throw new Error('payment lookup ' + r.status);   // 500, so the notice can be sent again
    const p = await r.json();
    if (p.payment_status !== 'finished' || String(p.order_id) !== String(m.order_id) || Number(p.price_amount) !== Number(m.price_amount) ||
        String(p.price_currency).toLowerCase() !== String(m.price_currency).toLowerCase()) {
      console.error('notice does not match payment', m.payment_id);
      return reply(409, { error: 'mismatch' });
    }
  }
  return reply(200, { status: await rpc('apply_payment', { p_order: m.order_id, p_payload: m }) });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  const path = new URL(req.url).pathname;
  try {
    if (path.endsWith('/checkout')) return await checkout(req);
    if (path.endsWith('/ipn')) return await ipn(req);
    return reply(404, { error: 'not_found' });
  } catch (e) {
    console.error(path, e);
    return reply(500, { error: 'server' });
  }
});
