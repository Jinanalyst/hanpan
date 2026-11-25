// What does this player own? Supabase checks the token and its row rules return only the player's own items,
// so the game server needs no secret key.
import { SUPABASE_URL, SUPABASE_KEY } from '../public/config.js';

const URL_ = process.env.SUPABASE_URL || SUPABASE_URL, KEY = process.env.SUPABASE_KEY || SUPABASE_KEY;

export const isToken = t => typeof t === 'string' && t.length < 4000 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t);

// Set of product ids, or null when it could not be checked (bad token, Supabase unreachable).
export async function ownedBy(token) {
  if (!URL_ || !KEY || !isToken(token)) return null;
  try {
    const r = await fetch(URL_ + '/rest/v1/entitlements?select=product_id', {
      headers: { apikey: KEY, authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    return new Set((await r.json()).map(x => x.product_id));
  } catch { return null; }
}
