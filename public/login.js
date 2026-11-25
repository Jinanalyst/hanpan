// Solana wallet login. The wallet signs a text message (no transaction, no fee) and Supabase checks the signature.
import { client, configured, currentUser, signOut, walletOf, shortWallet } from './auth.js';

const $ = id => document.getElementById(id);
const status = t => { $('status').textContent = t; };
const STATEMENT = 'Sign in to HANPAN. This does not cost anything or move any funds.';

/* ---- wallets found in this browser ---- */
let busy = false, searched = false;
const wallets = new Map();   // name -> { name, icon, adapter() }

// Wallet Standard: how current Solana wallets announce themselves to pages
function register(...list) {
  for (const w of list) {
    const f = w.features || {};
    if (!(w.chains || []).some(c => c.startsWith('solana:')) || !(f['solana:signIn'] || (f['standard:connect'] && f['solana:signMessage']))) continue;
    wallets.set(w.name, { name: w.name, icon: w.icon, adapter: () => standardAdapter(f) });
  }
  paint();
  return () => {};
}
async function standardAdapter(f) {
  if (f['solana:signIn']) return { signIn: input => f['solana:signIn'].signIn(input) };
  const { accounts } = await f['standard:connect'].connect();
  const account = accounts.find(a => a.chains.some(c => c.startsWith('solana:')));
  if (!account) throw new Error('This wallet has no Solana account.');
  return {
    publicKey: { toBase58: () => account.address },
    signMessage: async message => (await f['solana:signMessage'].signMessage({ account, message }))[0].signature,
  };
}
// Older wallets that only set window.solana
async function legacyAdapter(w) {
  if (typeof w.signIn === 'function') return { signIn: input => w.signIn(input) };
  await w.connect();
  return {
    publicKey: { toBase58: () => w.publicKey.toString() },
    signMessage: async message => { const r = await w.signMessage(message, 'utf8'); return r.signature || r; },
  };
}
addEventListener('wallet-standard:register-wallet', e => e.detail({ register }));
dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register } }));
setTimeout(() => {
  if (!wallets.size && window.solana) wallets.set('Browser wallet', { name: 'Browser wallet', adapter: () => legacyAdapter(window.solana) });
  paint(true);
}, 600);

/* ---- page ---- */
function paint(done) {
  if (done) searched = true;
  const box = $('wallets');
  box.textContent = '';
  for (const w of wallets.values()) {
    const b = document.createElement('button');
    b.type = 'button'; b.disabled = busy || !configured;
    if (/^data:image\//.test(w.icon || '')) { const i = document.createElement('img'); i.src = w.icon; i.alt = ''; b.append(i); }
    b.append(w.name);
    b.onclick = () => login(w);
    box.append(b);
  }
  $('noWallet').hidden = !searched || wallets.size > 0;
}

function explain(e) {
  const text = String(e?.message || e || '');
  if (e?.code === 4001 || /reject|cancel|declin|denied/i.test(text)) return 'You cancelled the request in your wallet.';
  if (e?.code === 'web3_provider_disabled' || /web3.*(disabled|not enabled)/i.test(text)) return 'Solana login is not turned on in Supabase yet.';
  if (e?.status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (/failed to fetch|network/i.test(text)) return 'The login server cannot be reached. Try again in a moment.';
  return 'Login failed: ' + (text || 'unknown error');
}

async function login(w) {
  if (busy) return;
  busy = true; paint();
  status(`Approve the sign-in request in ${w.name}…`);
  try {
    const sb = await client(), wallet = await w.adapter();
    const { data, error } = await sb.auth.signInWithWeb3({ chain: 'solana', statement: STATEMENT, wallet, options: { url: location.origin + location.pathname } });
    if (error) throw error;
    showUser(data.user);
    status('Signed in. Opening the game…');
    setTimeout(() => location.assign('./'), 700);
  } catch (e) {
    console.warn('[login]', e);
    status(explain(e));
  }
  busy = false; paint();
}

function showUser(user) {
  $('signedOut').hidden = !!user; $('signedIn').hidden = !user;
  $('guest').hidden = !!user;
  if (user) { $('addr').textContent = shortWallet(walletOf(user)); $('addr').title = walletOf(user); }
}
$('logout').onclick = async () => {
  try { await signOut(); showUser(null); status('Logged out.'); } catch (e) { status(explain(e)); }
};

if (!configured) status('Wallet login is not set up yet. You can still play as a guest.');
paint();
currentUser().then(showUser, e => { showUser(null); status(explain(e)); });
