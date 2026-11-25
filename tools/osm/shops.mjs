// Puts the shops of a city on ground-floor walls and gives them invented names. The same input always gives the same result.
import fs from 'node:fs';

const S = JSON.parse(fs.readFileSync(new URL('./shops.json', import.meta.url), 'utf8'));
const catOf = kind => { const i = S.categories.findIndex(c => c.kinds.includes(kind)); return i < 0 ? S.categories.length - 1 : i; };

const SLOT = 60, SLOT_MIN = 35, SLOT_MAX = 80;      // decimetres of wall for one shop
const REACH = 150;                                   // a shop that lies outside every building goes to a wall this close
const ROAD = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'pedestrian', 'service', 'primary_link', 'secondary_link', 'tertiary_link']);

const pairs = flat => { const out = []; for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return out; };
function inside(x, z, p) {
  let r = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) r = !r;
  return r;
}
function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k);
}
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// Returns { shops: [x, z, angle in tenths of a degree, width, category, name number], names: [[category, text]], left }.
// The angle turns a shop that faces +z until it faces away from its wall.
export function placeShops(city, realNames, fill = 0) {
  const rings = city.buildings.map(b => pairs(b.p)), box = rings.map(r => [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))]);
  const near = (x, z, m) => rings.map((_, i) => i).filter(i => x > box[i][0] - m && x < box[i][2] + m && z > box[i][1] - m && z < box[i][3] + m);
  const segs = city.roads.filter(r => ROAD.has(r.k)).flatMap(r => { const p = pairs(r.p); return p.slice(1).map((b, i) => [p[i], b, r.w / 2]); });
  const toRoad = (x, z) => { let d = Infinity; for (const [a, b, w] of segs) d = Math.min(d, segDist(x, z, a, b) - w); return Math.max(0, d); };

  // places for shops on the ground-floor walls of one building
  const made = new Map();
  function slots(i) {
    if (made.has(i)) return made.get(i);
    const r = rings[i], out = [];
    if (!city.buildings[i].b) for (let j = r.length - 1, k = 0; k < r.length; j = k++) {
      const [a, b] = [r[j], r[k]], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), n = Math.max(1, Math.floor((L - 6) / SLOT)), w = Math.min(SLOT_MAX, (L - 6) / n - 5);
      if (w < SLOT_MIN) continue;
      const nx = dz / L, nz = -dx / L;
      for (let q = 0; q < n; q++) {
        const t = (3 + (L - 6) * (q + 0.5) / n) / L, x = a[0] + dx * t, z = a[1] + dz * t;
        // needs open air in front
        const open = [-0.45, 0, 0.45].every(o => { const px = x + dx / L * w * o + nx * 12, pz = z + dz / L * w * o + nz * 12; return !near(px, pz, 0).some(m => m !== i && inside(px, pz, rings[m])) && !inside(px, pz, r); });
        if (open) out.push({ x, z, nx, nz, w, road: toRoad(x + nx * 5, z + nz * 5), free: true });
      }
    }
    made.set(i, out);
    return out;
  }
  function host(p) {
    const at = near(p.x, p.z, 0).filter(i => !city.buildings[i].b && inside(p.x, p.z, rings[i]));
    if (at.length) return at;
    let best = -1, bd = REACH;
    for (const i of near(p.x, p.z, REACH)) if (!city.buildings[i].b) for (let j = rings[i].length - 1, k = 0; k < rings[i].length; j = k++) { const d = segDist(p.x, p.z, rings[i][j], rings[i][k]); if (d < bd) { bd = d; best = i; } }
    return best < 0 ? [] : [best];
  }

  const placed = [];
  let left = 0;
  const list = city.pois.filter(p => !S.skip.includes(p.k) && !(p.l >= 2 || p.l < 0)).sort((a, b) => a.x - b.x || a.z - b.z || (a.k < b.k ? -1 : 1));
  for (const p of list) {
    let best = null, bs = Infinity;
    for (const i of host(p)) for (const s of slots(i)) {
      const v = Math.hypot(s.x - p.x, s.z - p.z) + s.road * 1.5;
      if (s.free && v < bs) { bs = v; best = s; }
    }
    if (!best) { left++; continue; }   // upper floors, or no open wall left
    best.free = false;
    placed.push({ s: best, cat: catOf(p.k) });
  }

  // the fighting area has few mapped shops: the free walls along its streets get made-up ones
  const mapped = placed.length, common = ['cafe', 'food', 'food', 'beauty', 'mart', 'fashion', 'clinic', 'bakery', 'bar', 'fast', 'goods', 'cafe', 'bank'];
  if (fill) rings.forEach((r, i) => {
    if (box[i][0] > fill || box[i][2] < -fill || box[i][1] > fill || box[i][3] < -fill) return;
    slots(i).forEach((s, k) => {
      const h = hash(city.id + i + ':' + k);
      if (!s.free || s.road > 150 || Math.abs(s.x) > fill || Math.abs(s.z) > fill || h % 100 < 14) return;   // some walls stay plain
      s.free = false;
      placed.push({ s, cat: S.categories.findIndex(c => c.id === common[(h >>> 8) % common.length]) });
    });
  });

  // names
  const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''), taken = new Set([...realNames].map(norm)), names = [], pools = S.categories.map(() => []), count = S.categories.map((_, c) => placed.filter(q => q.cat === c).length);
  S.categories.forEach((c, ci) => {
    const want = Math.min(count[ci], Math.max(1, Math.round(S.maxNames * count[ci] / (placed.length || 1))));
    for (let i = 0; pools[ci].length < want && i < want * 20; i++) {
      const h = hash(c.id + city.id + i), word = c.words[i % c.words.length], tail = c.tails[(h >>> 4) % c.tails.length], text = (word + ' ' + tail).replace('#', String((h >>> 8) % 98 + 2)), key = norm(text);
      if (taken.has(key)) continue;    // never a real name from the area, never the same one twice
      taken.add(key); pools[ci].push(names.length); names.push([ci, text]);
    }
  });
  const used = S.categories.map(() => 0);
  const shops = placed.map(({ s, cat }) => [Math.round(s.x), Math.round(s.z), Math.round(Math.atan2(s.nx, s.nz) * 1800 / Math.PI), Math.round(s.w), cat, pools[cat][used[cat]++ % pools[cat].length]]);
  return { shops, names, categories: S.categories.map(c => c.id), left, filled: placed.length - mapped };
}
