// Builds public/maps/<city>.json from OpenStreetMap. Runs by hand at build time, the game never calls Overpass.
//   node tools/osm/build.mjs gangnam            build one city (or several, or "all") from cities.json
//   node tools/osm/build.mjs gangnam --refresh  download again instead of using tools/osm/cache
//   --out <dir>                                 write somewhere else
// A city has either center + radius (a circle) or bbox [south, west, north, east]. Any value in "defaults" can be overridden per city.
//
// Output: every coordinate and height is an integer in decimetres. x is east and z is south, then the city is turned by -turn degrees
// so its main streets run along the axes. Business names are never written.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { placeShops } from './shops.mjs';
import { buildArena } from './arena.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, 'cities.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DM = v => Math.round(v * 10);
const LAT_M = 111132, LON_M = 111320;   // metres per degree (longitude at the equator)
const BUDGET = 5 * 1024 * 1024;
const MARGIN = 20;                       // roads run this far past the edge

/* ---- download ---- */
function bboxOf(c) {
  if (c.bbox) return c.bbox;
  const [lat, lon] = c.center, dLat = c.radius / LAT_M, dLon = c.radius / (LON_M * Math.cos(lat * Math.PI / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map(v => +v.toFixed(6));
}
async function download(c) {
  const query = `[out:json][timeout:120][bbox:${bboxOf(c).join(',')}];(way["building"];relation["building"];way["building:part"];relation["building:part"];way["highway"];node["highway"="crossing"];nwr["shop"];nwr["amenity"];);out geom;`;
  for (let i = 0, wait = 5; i < 8; i++, wait = Math.min(90, wait * 2)) {
    const url = c.endpoints[i % c.endpoints.length];
    try {
      const r = await fetch(url, {
        method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'user-agent': 'osm-city-extract/1.0' }, signal: AbortSignal.timeout(150000),
      });
      const text = await r.text();
      if (!r.ok || text[0] !== '{') throw new Error('HTTP ' + r.status);
      const d = JSON.parse(text);
      if (!d.elements?.length || /error|timed out/i.test(d.remark || '')) throw new Error(d.remark || 'empty answer');
      return d;
    } catch (e) {
      console.warn(`  ${url}: ${e.message}, next try in ${wait} s`);
      await sleep(wait * 1000);
    }
  }
  throw new Error('Overpass did not answer. Try again later.');
}
async function raw(id, c, refresh) {
  const file = path.join(HERE, 'cache', id + '.json'), key = bboxOf(c).join(',');
  if (!refresh && fs.existsSync(file)) {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (d.key === key) return d;   // a changed area downloads again
  }
  const d = { key, ...(await download(c)) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(d));
  return d;
}

/* ---- geometry ---- */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function area2(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a;
}
function centroid(p) {
  let a = 0, x = 0, z = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const k = p[j][0] * p[i][1] - p[i][0] * p[j][1];
    a += k; x += (p[j][0] + p[i][0]) * k; z += (p[j][1] + p[i][1]) * k;
  }
  return Math.abs(a) < 1e-6 ? p[0] : [x / (3 * a), z / (3 * a)];
}
function inside([x, z], p) {
  let r = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) r = !r;
  }
  return r;
}
function lineDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
  return l < 1e-9 ? dist(p, a) : Math.abs(dx * (p[1] - a[1]) - dz * (p[0] - a[0])) / l;
}
// Closed ring without repeated or straight-line points, wound so area2 > 0.
function cleanRing(pts, tol) {
  const p = pts.filter((q, i) => i === 0 || dist(q, pts[i - 1]) > 0.05);
  if (p.length > 1 && dist(p[0], p.at(-1)) < 0.05) p.pop();
  for (let again = true; again && p.length > 3;) {
    again = false;
    for (let i = 0; i < p.length && p.length > 3; i++) {
      if (lineDist(p[i], p.at(i - 1), p[(i + 1) % p.length]) < tol) { p.splice(i--, 1); again = true; }
    }
  }
  if (p.length < 3) return null;
  return area2(p) < 0 ? p.reverse() : p;
}
// The members of a relation are pieces of rings in any order.
function joinRings(ways) {
  const left = ways.filter(w => w.length > 1).map(w => [...w]), out = [], same = (a, b) => dist(a, b) < 0.02;
  while (left.length) {
    const r = left.pop();
    for (let grew = true; grew && !same(r[0], r.at(-1));) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i];
        if (same(w.at(-1), r.at(-1))) w.reverse();
        if (!same(w[0], r.at(-1))) continue;
        r.push(...w.slice(1)); left.splice(i, 1); grew = true;
        break;
      }
    }
    if (same(r[0], r.at(-1)) && r.length > 3) out.push(r);
  }
  return out;
}

/* ---- tags ---- */
function metres(v) {
  if (v == null) return NaN;
  const s = String(v).replace(',', '.'), n = parseFloat(s);
  if (!/'|ft|feet/.test(s)) return n;
  const inch = /(\d+(?:\.\d+)?)\s*"/.exec(s);
  return n * 0.3048 + (inch ? +inch[1] * 0.0254 : 0);
}
// height, then building:levels x 3.2 m, then the default. Returns [metres, source].
function heightOf(t, c, outline) {
  const h = metres(t.height);
  if (h > 0) return [Math.max(c.minHeight, h), 'height'];
  const l = parseFloat(t['building:levels']);
  if (l > 0) return [Math.max(c.minHeight, l * c.levelHeight), 'levels'];
  return outline ? [outline, 'inherited'] : [c.defaultHeight, 'default'];   // a building part takes the height of its building
}
function baseOf(t, c) {
  const h = metres(t.min_height), l = parseFloat(t['building:min_level']);
  return h > 0 ? h : l > 0 ? l * c.levelHeight : 0;
}
const USE = {
  c: ['commercial', 'retail', 'shop', 'supermarket', 'mall', 'kiosk', 'hotel', 'department_store', 'restaurant', 'cinema', 'theatre'],
  o: ['office', 'government', 'civic', 'public', 'bank', 'company'],
  r: ['residential', 'apartments', 'house', 'detached', 'terrace', 'dormitory', 'semidetached_house', 'bungalow'],
  s: ['school', 'university', 'college', 'kindergarten', 'academy', 'hospital', 'church', 'temple', 'shrine', 'cathedral', 'chapel', 'mosque', 'train_station', 'transportation', 'museum', 'stadium'],
  i: ['industrial', 'warehouse', 'garage', 'garages', 'parking', 'service', 'shed', 'hangar'],
};
function useOf(t) {   // commercial, office, residential, special, industrial or unknown
  const words = [t.building, t['building:part'], t['building:use'], t['building:usage']].filter(Boolean).join(';').split(/[;,]/).map(v => v.trim());
  for (const v of words) for (const k in USE) if (USE[k].includes(v)) return k;
  return t.office ? 'o' : t.shop || t.tourism === 'hotel' ? 'c' : 'u';
}
// Facade: 0 office, 1 commercial, 2 residential, 3 low brick. Most buildings are only tagged "yes", so size decides for them.
function facadeOf(use, h, m2) {
  if (use === 'o') return 0;
  if (use === 'r') return h > 16 ? 2 : 3;
  if (use === 'c' || use === 's' || use === 'i') return h > 60 ? 0 : 1;
  return h >= 45 ? 0 : h <= 16 && m2 < 400 ? 3 : 1;
}
const below = t => +t.layer < 0 || t.location === 'underground' || t.indoor === 'yes' || (t.tunnel && t.tunnel !== 'no' && t.tunnel !== 'building_passage');

/* ---- one city ---- */
function convert(id, c, data) {
  const [s, w, n, e] = bboxOf(c), lat0 = c.bbox ? (s + n) / 2 : c.center[0], lon0 = c.bbox ? (w + e) / 2 : c.center[1], kx = LON_M * Math.cos(lat0 * Math.PI / 180);
  const flat = g => [(g.lon - lon0) * kx, -(g.lat - lat0) * LAT_M], line = g => (g || []).filter(Boolean).map(flat);
  const hw = (e - w) / 2 * kx, hh = (n - s) / 2 * LAT_M;
  const inArea = c.bbox ? (p, m = 0) => Math.abs(p[0]) <= hw + m && Math.abs(p[1]) <= hh + m : (p, m = 0) => Math.hypot(p[0], p[1]) <= c.radius + m;   // before turning
  const els = data.elements.filter(x => x.tags);

  // footprints, still facing north
  const shapes = [];
  for (const x of els) {
    const t = x.tags, part = !!t['building:part'] && t['building:part'] !== 'no';
    if (x.type === 'node' || (!part && (!t.building || t.building === 'no')) || below(t) || ['roof', 'carport'].includes(t.building)) continue;
    const members = role => joinRings((x.members || []).filter(m => m.type === 'way' && m.geometry && (m.role === 'inner') === role).map(m => line(m.geometry)));
    const outer = x.type === 'way' ? [line(x.geometry)] : members(false), inner = x.type === 'way' ? [] : members(true);
    const holes = inner.map(r => cleanRing(r, c.simplify)).filter(r => r && area2(r) / 2 > c.minArea);
    for (const o of outer) {
      const ring = cleanRing(o, c.simplify);
      if (!ring || area2(ring) / 2 < c.minArea) continue;
      shapes.push({ t, part, ring, area: area2(ring) / 2, at: centroid(ring), holes: holes.filter(h => inside(centroid(h), ring)) });
    }
  }

  // turn the city so its most common wall direction lies on the axes
  let turn = +c.rotate || 0;
  if (c.rotate === 'auto') {
    const bins = new Float64Array(180);   // half degrees, 0 to 90
    for (const { ring } of shapes) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const dx = ring[i][0] - ring[j][0], dz = ring[i][1] - ring[j][1], a = ((Math.atan2(dz, dx) * 180 / Math.PI) % 90 + 90) % 90;
      bins[Math.floor(a * 2) % 180] += Math.hypot(dx, dz);
    }
    let best = 0;
    for (let i = 0; i < 180; i++) {
      let v = 0;
      for (let k = -4; k <= 4; k++) v += bins[(i + k + 180) % 180] * (5 - Math.abs(k));
      if (v > best) { best = v; turn = (i + 0.5) / 2; }
    }
    if (turn > 45) turn -= 90;
  }
  const ca = Math.cos(-turn * Math.PI / 180), sa = Math.sin(-turn * Math.PI / 180);
  const put = ([x, z]) => [DM(x * ca - z * sa), DM(x * sa + z * ca)], flatten = r => r.flatMap(put);

  // buildings; a building fully described by its parts is drawn as those parts
  const stats = { height: 0, levels: 0, default: 0, inherited: 0, parts: 0, duplicates: 0, hidden: 0 };
  const parts = shapes.filter(q => q.part), mains = [];
  for (const b of shapes.filter(q => !q.part).sort((p, q) => q.area - p.area)) {
    if (mains.some(m => Math.abs(m.area - b.area) < m.area * 0.05 && dist(m.at, b.at) < 0.7)) { stats.duplicates++; continue; }   // the same house mapped twice
    mains.push(b);
  }
  const list = [];
  const emit = (q, [h, src], base) => {
    if (!q.ring.some(p => inArea(p))) return;
    if (base >= h) base = 0;
    const use = useOf(q.t), levels = Math.round(parseFloat(q.t['building:levels']));
    list.push({ q, src, h, base, out: {
      p: flatten(q.ring), ...(q.holes.length ? { o: q.holes.map(flatten) } : {}), h: DM(h), ...(base ? { b: DM(base) } : {}),
      u: use, f: facadeOf(use, h, q.area), n: levels > 0 && src === 'height' && h / levels > 2.4 && h / levels < 6 ? levels : Math.max(1, Math.round((h - base) / c.levelHeight)),
      ...(src === 'default' ? { g: 1 } : {}),   // o: courtyards, b: starts above ground, u: use, f: facade, n: floors, g: the height is a guess
    } });
  };
  for (const b of mains) {
    const mine = parts.filter(q => !q.used && inside(q.at, b.ring)), H = heightOf(b.t, c);
    const cover = mine.filter(q => !baseOf(q.t, c)).reduce((v, q) => v + q.area, 0);
    if (cover <= b.area * 0.7) emit(b, H, baseOf(b.t, c));
    for (const q of mine) { q.used = true; emit({ ...q, t: { ...q.t, building: q.t.building || b.t.building } }, heightOf(q.t, c, H[0]), baseOf(q.t, c)); }
  }
  for (const q of parts) if (!q.used) emit(q, heightOf(q.t, c), baseOf(q.t, c));

  // a building that stands inside another one at least as tall is never seen, and its walls would flicker
  const samples = r => { const x = r.map(p => p[0]), z = r.map(p => p[1]), x0 = Math.min(...x), z0 = Math.min(...z), dx = Math.max(...x) - x0, dz = Math.max(...z) - z0, out = []; for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) { const p = [x0 + dx * (i + 0.5) / 14, z0 + dz * (j + 0.5) / 14]; if (inside(p, r)) out.push(p); } return out; };
  const buildings = [], gone = new Set();
  list.forEach((a, i) => {
    const pts = samples(a.q.ring), m = list.findIndex((b, j) => j !== i && !gone.has(j) && b.h >= a.h && b.base <= a.base && b.q.area > a.q.area * 0.8 && pts.filter(p => inside(p, b.q.ring) && !b.q.holes.some(o => inside(p, o))).length > pts.length * 0.9);
    if (m >= 0) { gone.add(i); stats.hidden++; return; }
    stats[a.src]++;
    if (a.q.part) stats.parts++;
    buildings.push(a.out);
  });

  // roads, cut at the edge of the area
  const roads = [], crossings = [];
  const edge = (a, b) => {   // last point of a -> b that is still inside
    let lo = 0, hi = 1;
    const at = k => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (inArea(at(m), MARGIN)) lo = m; else hi = m; }
    return at(lo);
  };
  for (const x of els) {
    const t = x.tags;
    if (x.type === 'node' && t.highway === 'crossing') {
      const p = flat(x), [a, b] = put(p);
      if (inArea(p, MARGIN)) crossings.push({ x: a, z: b, ...(t.crossing === 'traffic_signals' || t['crossing:signals'] === 'yes' ? { s: 1 } : {}) });   // s: has signals
      continue;
    }
    if (!t.highway || x.type !== 'way' || !x.geometry || below(t) || ['proposed', 'construction', 'elevator', 'corridor', 'rest_area'].includes(t.highway)) continue;
    const lanes = parseInt(t.lanes) || 0, width = metres(t.width) || (lanes ? lanes * c.laneWidth : c.roadWidth[t.highway] || 4);
    const kind = t.footway === 'crossing' || t.path === 'crossing' ? 'crossing' : t.footway === 'sidewalk' ? 'sidewalk' : t.highway;
    const walk = kind.endsWith('_link') || kind === 'residential' ? (width >= 9 || kind !== 'residential' ? c.sidewalk[kind] || 0 : 0) : c.sidewalk[kind] || 0;
    const base = {   // s: pavement on each side, k: kind, w: width, n: lanes, one: one way, a: an area not a line, y: level above ground
      k: kind, w: DM(width), ...(walk ? { s: DM(walk) } : {}), ...(lanes ? { n: lanes } : {}), ...(t.oneway === 'yes' ? { one: 1 } : {}), ...(t.area === 'yes' ? { a: 1 } : {}),
      ...(+t.layer > 0 || (t.bridge && t.bridge !== 'no') ? { y: +t.layer || 1 } : {}),
    };
    const pts = line(x.geometry);
    let run = [];
    const flush = () => { if (run.length > 1) roads.push({ ...base, p: run.flatMap(put) }); run = []; };
    pts.forEach((p, i) => {
      const now = inArea(p, MARGIN), was = i > 0 && inArea(pts[i - 1], MARGIN);
      if (now) { if (i > 0 && !was) run.push(edge(p, pts[i - 1])); run.push(p); } else if (was) { run.push(edge(pts[i - 1], p)); flush(); }
    });
    flush();
  }

  // shops: the kind of business and the place only
  const pois = [];
  for (const x of els) {
    const t = x.tags, kind = t.shop && t.shop !== 'no' ? t.shop : t.amenity;
    if (!kind || !/^[a-z_]+$/.test(kind) || c.ignorePoi.includes(kind)) continue;
    const bb = x.bounds, p = x.type === 'node' ? flat(x) : bb ? flat({ lat: (bb.minlat + bb.maxlat) / 2, lon: (bb.minlon + bb.maxlon) / 2 }) : null;
    if (!p || !inArea(p)) continue;
    const [a, b] = put(p), lv = parseFloat(t.level);
    pois.push({ k: kind, x: a, z: b, ...(lv ? { l: lv } : {}) });   // l: floor, when it is not the ground floor
  }

  // invented names must not match any real one nearby
  const real = new Set(els.flatMap(x => Object.entries(x.tags).filter(([k]) => /^(name|brand|operator|alt_name|official_name|short_name)(:|$)/.test(k)).map(([, v]) => v)));
  const { shops, names, categories, left, filled } = placeShops({ id, buildings, roads, pois }, real, DM(c.play + 5));
  // stairs down to a station make an entrance
  const steps = els.filter(x => x.type === 'way' && x.tags.highway === 'steps' && x.geometry).map(x => { const p = line(x.geometry), [a, b] = put(p[0]); return [a / 10, b / 10]; }).filter(p => Math.hypot(...p) < c.play);
  const { arena, stats: A } = buildArena({ unit: 0.1, play: c.play, buildings, roads }, steps);

  return {
    id, name: c.name, desc: c.desc, unit: 0.1, center: [lat0, lon0], ...(c.bbox ? { half: [Math.round(hw), Math.round(hh)] } : { radius: c.radius }), play: c.play, turn: +turn.toFixed(2),
    source: { attribution: '© OpenStreetMap contributors', license: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright', date: data.osm3s?.timestamp_osm_base || '' },
    stats: { buildings: buildings.length, ...stats, roads: roads.length, crossings: crossings.length, pois: pois.length, shops: shops.length, shopsLeft: left, shopsFilled: filled, arena: A },
    drive: c.drive, arena, buildings, roads, crossings, shops, shopNames: names, shopKinds: categories,
  };
}

/* ---- command line ---- */
const args = process.argv.slice(2), oi = args.indexOf('--out');
const out = oi >= 0 ? args.splice(oi, 2)[1] : path.join(HERE, '..', '..', 'public', 'maps');
const refresh = args.includes('--refresh'), asked = args.filter(a => !a.startsWith('--'));
const ids = asked.includes('all') ? Object.keys(CONFIG.cities) : asked;
if (!ids.length) {
  console.log('Usage: node tools/osm/build.mjs <city|all> [--refresh] [--out dir]\nCities: ' + Object.keys(CONFIG.cities).join(', '));
  process.exit(1);
}
for (const id of ids) {
  if (!Object.hasOwn(CONFIG.cities, id)) { console.error('Unknown city: ' + id); process.exit(1); }
  console.log(id);
  const c = { ...CONFIG.defaults, ...CONFIG.cities[id] };
  const city = convert(id, c, await raw(id, c, refresh)), text = JSON.stringify(city);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, id + '.json'), text);
  const kb = v => (v / 1024).toFixed(1) + ' KB', gz = zlib.gzipSync(text, { level: 9 }).length;
  console.log(`  ${kb(Buffer.byteLength(text))}, gzip ${kb(gz)}, turned ${city.turn} deg\n  ${JSON.stringify(city.stats)}`);
  if (gz > BUDGET) { console.error('  over the 5 MB budget'); process.exitCode = 1; }
}
// The list of finished cities for the menu, with a rough plan of each.
if (oi < 0) {
  const list = Object.keys(CONFIG.cities).filter(id => fs.existsSync(path.join(out, id + '.json'))).map(id => {
    const d = JSON.parse(fs.readFileSync(path.join(out, id + '.json'), 'utf8'));
    return { id, name: d.name, desc: d.desc, half: d.arena.half, plan: d.arena.solids.filter(s => (s[2] - s[0]) * (s[3] - s[1]) > 12).map(s => s.slice(0, 4).map(Math.round)) };
  });
  fs.writeFileSync(path.join(HERE, '..', '..', 'public', 'shared', 'realcities.js'), '// Written by tools/osm/build.mjs. plan: [x0, z0, x1, z1] of the bigger buildings, in metres.\nexport const REAL = ' + JSON.stringify(list) + ';\n');
}
