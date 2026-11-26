// Supabase session shared by the login page and the game menu.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const STORAGE_KEY = 'hanpan-auth';

function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  try { return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'; } catch { return false; }
}
if (isSecretKey(SUPABASE_KEY)) console.error('config.js holds a SECRET Supabase key. Remove it, rotate it in Supabase, and use the publishable key.');
export const configured = !!SUPABASE_URL && !!SUPABASE_KEY && !isSecretKey(SUPABASE_KEY);

let ready = null;
// The library is only downloaded when it is needed.
export function client() {
  if (!configured) return Promise.reject(new Error('Login is not set up yet.'));
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/supabase.js';
      s.onload = resolve;
      s.onerror = () => { s.remove(); reject(new Error('The login library did not load. Check your connection and try again.')); };
      document.head.append(s);
    }).then(() => window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storageKey: STORAGE_KEY, detectSessionInUrl: false } }));
    ready.catch(() => { ready = null; });
  }
  return ready;
}

export const maybeSignedIn = () => { try { return configured && localStorage.getItem(STORAGE_KEY) != null; } catch { return false; } };

// Wallet address of a signed-in user. Read from the verified identity, not user_metadata, which users can edit.
export function walletOf(user) {
  const id = user?.identities?.find(i => i.provider === 'web3')?.identity_data;
  return id?.custom_claims?.address || String(id?.sub || '').split(':').pop();
}
export const shortWallet = a => (a && a.length > 10 ? a.slice(0, 4) + '…' + a.slice(-4) : a || 'Wallet');

// A guest (anonymous login, made on the Servers page) counts as logged out everywhere else:
// the store, the game menu and the wallet login page only know wallet players.
export async function currentUser({ guest = false } = {}) {
  if (!maybeSignedIn()) return null;
  const { data } = await (await client()).auth.getSession();
  const user = data.session?.user || null;
  return user && user.is_anonymous && !guest ? null : user;
}

export async function accessToken() {
  if (!maybeSignedIn()) return null;
  const { data } = await (await client()).auth.getSession();
  return data.session?.user?.is_anonymous ? null : data.session?.access_token || null;
}

// Servers without a wallet: an anonymous login that stays in this browser.
export async function signInGuest() {
  const { data, error } = await (await client()).auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

let ownedCache = null;
// Set of bought product ids. Only for showing locks: the game server checks again on its own.
export async function ownedProducts(fresh) {
  if (ownedCache && !fresh) return ownedCache;
  if (!await currentUser()) return new Set();
  const { data, error } = await (await client()).from('entitlements').select('product_id');
  if (error) throw error;
  return (ownedCache = new Set(data.map(x => x.product_id)));
}

export async function signOut() {
  ownedCache = null;
  const { error } = await (await client()).auth.signOut({ scope: 'local' });   // this browser only
  if (error) throw error;
}
