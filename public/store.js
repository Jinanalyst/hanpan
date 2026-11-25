// Store page. Prices come from the database; buying opens a NOWPayments invoice made by the server.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { client, configured, currentUser, maybeSignedIn, accessToken, ownedProducts, walletOf, shortWallet } from './auth.js';
import { WEAPONS, damageAt } from './shared/weapons.js';
import { MAP_LIST, getMap } from './shared/map.js';
import { floorPlan } from './floorplan.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const status = t => { $('status').textContent = t; };
const money = n => '$' + Number(n).toFixed(2);
const framed = window.top !== window.self;

let prices = null, owned = new Set(), user = null, busy = false;

const goods = [
  ...Object.entries(WEAPONS).filter(([, w]) => w.product).map(([id, w]) => ({ id: w.product, box: 'weapons', name: w.name, desc: w.desc, art: () => stats(WEAPONS[id]) })),
  ...MAP_LIST.filter(m => m.product).map(m => ({ id: m.product, box: 'lands', name: m.name, desc: m.desc, art: () => floorPlan(getMap(m.id)) })),
];

function stats(W) {
  const box = el('dl', 'stats');
  const far = damageAt(W, 60, false) / W.dmg;
  for (const [label, v, text] of [
    ['Damage', W.dmg * (W.pellets || 1) / 100, W.pellets ? `${W.dmg} × ${W.pellets}` : W.dmg],
    ['Fire rate', 60 / W.rate / 950, Math.round(60 / W.rate) + '/min'],
    ['Magazine', W.mag / 80, W.mag],
    ['Range', far, far > 0.95 ? 'Long' : far > 0.7 ? 'Medium' : 'Short'],
  ]) {
    const bar = el('span', 'bar'), i = el('i');
    i.style.width = Math.round(Math.min(1, v) * 100) + '%'; bar.append(i);
    const dd = el('dd', '', text); dd.append(bar);
    box.append(el('dt', '', label), dd);
  }
  return box;
}

function paint() {
  $('weapons').textContent = ''; $('lands').textContent = '';
  for (const g of goods) {
    const card = el('article', 'good'), price = prices?.get(g.id), foot = el('div', 'foot');
    card.append(g.art(), el('h3', '', g.name), el('p', '', g.desc), foot);
    if (owned.has(g.id)) foot.append(el('b', 'own', 'Owned'));
    else {
      foot.append(el('b', 'price', price ? money(price) : ''));
      const b = el('button', 'primary', price ? (user ? 'Buy' : 'Log in to buy') : 'Not on sale');
      b.type = 'button'; b.disabled = busy || !price || framed;
      b.setAttribute('aria-label', `${b.textContent}: ${g.name}`);
      b.onclick = () => (user ? buy(g) : location.assign('login.html?next=store'));
      foot.append(b);
    }
    $(g.box).append(card);
  }
}

const WHY = {
  owned: 'You already own this.', store_closed: 'The store is not open yet.', not_signed_in: 'Your login has expired. Log in again.',
  too_many_orders: 'Too many orders in the last hour. Try again later.', payment_provider: 'The payment service did not answer. You have not been charged. Try again.',
  unknown_product: 'This item is not on sale right now.',
};
async function buy(g) {
  if (busy) return;
  busy = true; paint(); status(`Opening payment for ${g.name}…`);
  try {
    const token = await accessToken();
    if (!token) throw new Error('not_signed_in');
    const r = await fetch(SUPABASE_URL + '/functions/v1/store/checkout', {
      method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ product: g.id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'server');
    const u = new URL(j.invoice_url);
    if (u.protocol !== 'https:' || !/(^|\.)nowpayments\.io$/.test(u.hostname)) throw new Error('server');
    if (['confirming', 'partial', 'review'].includes(j.status)) { busy = false; paint(); status(''); return track(j.order_id); }   // already paying for this one
    location.assign(u.href);
    return;
  } catch (e) {
    console.warn('[store]', e);
    status(WHY[e.message] || 'Could not start the payment. You have not been charged. Try again in a moment.');
  }
  busy = false; paint();
}

/* ---- order progress, after coming back from the payment page ---- */
const PROGRESS = {
  new: 'Waiting for your payment.', pending: 'Waiting for your payment.', confirming: 'Payment seen. Waiting for the network to confirm it…',
  paid: 'Payment complete.', duplicate: 'Payment complete, but you already owned this. Contact support for a refund.',
  partial: 'Less than the full price arrived. Contact support with the order number.', review: 'This payment needs a manual check. Contact support with the order number.',
  failed: 'The payment failed.', expired: 'The payment time ran out. If you already sent it, keep this order number.', refunded: 'This payment was refunded.',
};
let tracking = 0;
async function track(id) {
  const box = $('orderBox'), run = ++tracking;
  box.hidden = false;
  for (let i = 0; i < 240 && run === tracking; i++) {
    let o = null;
    try { o = (await (await client()).from('orders').select('id,product_id,status').eq('id', id).single()).data; } catch { /* try again */ }
    const g = goods.find(x => x.id === o?.product_id);
    box.textContent = '';
    if (o) {
      box.append(el('b', '', g?.name || o.product_id), el('span', '', PROGRESS[o.status] || o.status), el('small', '', 'Order ' + o.id));
      if (o.status === 'paid') { owned = await ownedProducts(true).catch(() => owned); paint(); }
      if (!['new', 'pending', 'confirming'].includes(o.status)) return;
    } else box.append(el('span', '', 'Looking up your order…'));
    await new Promise(r => setTimeout(r, 5000));
  }
}

async function start() {
  if (!configured) { status('The store is not set up yet.'); paint(); return; }
  paint();
  const [p, u] = await Promise.all([
    fetch(SUPABASE_URL + '/rest/v1/products?select=id,price_usd', { headers: { apikey: SUPABASE_KEY } }).then(r => (r.ok ? r.json() : Promise.reject(new Error('products ' + r.status)))).catch(e => { console.warn('[store]', e); return null; }),
    maybeSignedIn() ? currentUser().catch(() => null) : null,
  ]);
  user = u;
  prices = new Map((p || []).map(x => [x.id, x.price_usd]));
  if (!p) status('The store is not available right now. Try again later.');
  if (framed) status('The store does not work inside another page. Open hanpan.team directly.');
  if (user) owned = await ownedProducts().catch(() => new Set());
  const a = el('a', '', user ? shortWallet(walletOf(user)) : 'Log in with wallet');
  a.href = user ? 'login.html' : 'login.html?next=store';
  $('who').replaceChildren(a);
  paint();
  const id = new URLSearchParams(location.search).get('order');
  if (user && /^[0-9a-f-]{36}$/i.test(id || '')) track(id);
}
start();
