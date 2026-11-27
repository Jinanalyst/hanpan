// The player's character, kept in this browser: call sign, three kits (guns, equipment, outfit) and an online service record.
import { isPrimary, isSidearm, isEquip, isWeapon, EXTRA_SLOTS, FREE_WEAPONS } from './shared/weapons.js';
import { cleanGear } from './shared/gear.js';

const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window: lasts until the page closes */ } };
const parse = k => { try { return JSON.parse(get(k)) || {}; } catch { return {}; } };

export const KITS = 3;
const START = [
  { lo: 'rifle', eq: 'frag', gear: {} },
  { lo: 'sniper', eq: 'smoke', gear: { helmet: 'boonie', face: 'paint', vest: 'ghillie', camo: 'woodland', pack: 'hydro', gloves: 'olive', boots: 'brown' } },
  { lo: 'bullpup', eq: 'med', gear: { helmet: 'nvg', face: 'balaclava', vest: 'heavy', camo: 'night', extra: 'full' } },
];
// Extra guns on keys 3 to 5: weapon ids or 'none', never one the kit already carries.
// A kit saved before these slots existed gets the first free guns it does not carry.
export function cleanExtras(x, lo, sa) {
  const have = [lo, sa], out = [];
  const list = Array.isArray(x) ? x : FREE_WEAPONS.filter(w => !have.includes(w)).slice(0, EXTRA_SLOTS);
  for (let i = 0; i < EXTRA_SLOTS; i++) {
    const w = list[i];
    out.push(isWeapon(w) && !have.includes(w) && !out.includes(w) ? w : 'none');
  }
  return out;
}
function cleanKit(k, i) {
  const d = START[i], o = k && typeof k === 'object' ? k : {};
  const lo = isPrimary(o.lo) ? o.lo : i === 0 && isPrimary(get('hanpan-lo')) ? get('hanpan-lo') : START[i].lo, sa = isSidearm(o.sa) ? o.sa : 'pistol';
  return { lo, sa, x: cleanExtras(o.x, lo, sa), eq: isEquip(o.eq) ? o.eq : d.eq, gear: cleanGear(o.gear || d.gear) };
}
// The guns a kit carries, in key order (1 primary, 2 sidearm, 3 to 5 extras).
export const kitGuns = k => [k.lo, k.sa, ...k.x.filter(w => w !== 'none')];
export function loadProfile() {
  const p = parse('hanpan-profile');
  return { active: [0, 1, 2].includes(p.active) ? p.active : 0, kits: Array.from({ length: KITS }, (_, i) => cleanKit(p.kits?.[i], i)) };
}
export const saveProfile = p => set('hanpan-profile', JSON.stringify({ active: p.active, kits: p.kits }));
export const activeKit = p => p.kits[p.active];

export const loadName = () => get('hanpan-name') || 'Recruit' + Math.floor(Math.random() * 900 + 100);
export const saveName = n => set('hanpan-name', n);

const RECORD = ['matches', 'wins', 'kills', 'deaths', 'heads'];
export function loadRecord() {
  const r = parse('hanpan-record');
  return Object.fromEntries(RECORD.map(k => [k, Number.isFinite(r[k]) && r[k] > 0 ? Math.floor(r[k]) : 0]));
}
export function addRecord(add) {
  const r = loadRecord();
  for (const k in add) r[k] += add[k];
  set('hanpan-record', JSON.stringify(r));
}
