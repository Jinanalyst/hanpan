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

export async function currentUser() {
  if (!maybeSignedIn()) return null;
  const { data } = await (await client()).auth.getSession();
  return data.session?.user || null;
}

export async function signOut() {
  const { error } = await (await client()).auth.signOut({ scope: 'local' });   // this browser only
  if (error) throw error;
}
