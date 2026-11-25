// Roads, pavements, crossings and road paint of a generated city. Everything is flat: thin layers stacked a little above the ground.
// Textures follow world coordinates, so pieces of the same layer may overlap without showing.
import * as THREE from 'three';
import { ring } from './shared/osmgeo.js';
import { canvasTexture, speck } from './osmtex.js';

const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service', 'busway', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const MAIN = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'busway', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const CURB = 0.3, LANE = 3.2;
const WHITE = [0.86, 0.86, 0.83], YELLOW = [0.88, 0.62, 0.12];

/* ---- flat shapes ---- */
const layer = () => ({ p: [], c: [], ix: [] });
function tri(L, a, b, c, up) { if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0 === up) L.ix.push(a[2], b[2], c[2]); else L.ix.push(a[2], c[2], b[2]); }
function point(L, x, z, col) { L.p.push(x, 0, z); if (col) L.c.push(...col); return [x, z, L.p.length / 3 - 1]; }
function quad(L, pts, col) { const q = pts.map(([x, z]) => point(L, x, z, col)); tri(L, q[0], q[1], q[2], true); tri(L, q[0], q[2], q[3], true); }
// A strip centred on a line segment.
function strip(L, a, b, w, col) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
  if (l < 1e-3) return;
  const nx = -dz / l * w / 2, nz = dx / l * w / 2;
  quad(L, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], col);
}
function disc(L, [x, z], r) {
  const n = 14, c = point(L, x, z), rim = Array.from({ length: n }, (_, i) => point(L, x + Math.cos(i / n * Math.PI * 2) * r, z + Math.sin(i / n * Math.PI * 2) * r));
  rim.forEach((q, i) => tri(L, c, q, rim[(i + 1) % n], true));
}
function path(L, pts, w, open) {   // open[0], open[1]: no round end there
  for (let i = 1; i < pts.length; i++) strip(L, pts[i - 1], pts[i], w);
  pts.forEach((p, i) => { if (!(i === 0 && open?.[0]) && !(i === pts.length - 1 && open?.[1])) disc(L, p, w / 2); });
}
function polygon(L, pts) {
  const p = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 0.2 ? pts.slice(0, -1) : pts, q = p.map(([x, z]) => point(L, x, z));
  if (p.length > 2) for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), [])) tri(L, q[a], q[b], q[c], true);
}

/* ---- which road is here ---- */
function index(roads) {
  const G = 25, grid = new Map(), segs = [];
  roads.forEach((r, id) => {
    for (let i = 1; i < r.pts.length; i++) {
      const [a, b] = [r.pts[i - 1], r.pts[i]], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 1e-3) continue;
      const s = { id, r, a, b, l, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l }, m = r.w / 2 + 28;
      segs.push(s);
      for (let x = Math.floor((Math.min(a[0], b[0]) - m) / G); x <= Math.floor((Math.max(a[0], b[0]) + m) / G); x++) {
        for (let z = Math.floor((Math.min(a[1], b[1]) - m) / G); z <= Math.floor((Math.max(a[1], b[1]) + m) / G); z++) { const k = x + ',' + z; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
      }
    }
  });
  const at = (x, z) => grid.get(Math.floor(x / G) + ',' + Math.floor(z / G)) || [];
  const dist = (s, x, z) => { const k = Math.max(0, Math.min(s.l, (x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz)); return Math.hypot(x - s.a[0] - s.dx * k, z - s.a[1] - s.dz * k); };
  return { segs, at, dist };
}

/* ---- paint ---- */
// Should road r paint something at this place, or does the place belong to another road?
function owns(ix, seg, x, z, gap = 0.4) {
  const own = ix.dist(seg, x, z);
  for (const s of ix.at(x, z)) {
    if (s.id === seg.id || s.r.rank < seg.r.rank && !(Math.abs(s.dx * seg.dx + s.dz * seg.dz) > 0.9)) continue;   // a side street does not break a main road's lines
    const d = ix.dist(s, x, z);
    if (d > s.r.w / 2 + gap) continue;
    const para = Math.abs(s.dx * seg.dx + s.dz * seg.dz) > 0.9;
    if (!para) return false;
    const end = [s.a, s.b].some(p => [seg.a, seg.b].some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.3));   // the same road going on
    if (!end && d < own - 0.05) return false;
  }
  return true;
}
// Where main roads cross: no lane paint there.
function junctions(roads) {
  const main = roads.filter(r => r.rank === 3 && !r.k.endsWith('_link') && r.k !== 'busway'), ends = new Map(), out = [];
  for (const r of main) for (const [p, q] of [[r.pts[0], r.pts[1]], [r.pts.at(-1), r.pts.at(-2)]]) {
    const k = Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2), l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    if (!ends.has(k)) ends.set(k, []);
    ends.get(k).push({ p, w: r.w, dx: (q[0] - p[0]) / l, dz: (q[1] - p[1]) / l });
  }
  for (const e of ends.values()) if (e.some(a => e.some(b => Math.abs(a.dx * b.dx + a.dz * b.dz) < 0.75))) out.push([...e[0].p, Math.max(...e.map(a => a.w)) / 2 + 5]);
  return out;
}
function lanes(paint, fill, ix, r, id, stop) {
  if (r.rank < 2 || r.w < 5) return;
  const n = Math.max(1, r.n || Math.round(r.w / LANE)), lw = r.w / n, two = !r.one;
  for (const s of ix.segs) {
    if (s.id !== id) continue;
    const nx = -s.dz, nz = s.dx, put = (t, o, len, w, col) => {
      const x = s.a[0] + s.dx * t + nx * o, z = s.a[1] + s.dz * t + nz * o;
      if (!owns(ix, s, x, z) || stop(x, z)) return;
      strip(paint, [x - s.dx * len / 2, z - s.dz * len / 2], [x + s.dx * len / 2, z + s.dz * len / 2], w, col);
    };
    for (let i = 1; i < n; i++) {
      const o = -r.w / 2 + lw * i, mid = two && Math.abs(i - n / 2) < 0.6 && (n % 2 === 0 || i === (n + 1) / 2);
      if (mid) for (let t = 1; t < s.l; t += 2) { put(t, o - 0.12, 2.02, 0.12, YELLOW); put(t, o + 0.12, 2.02, 0.12, YELLOW); }
      else for (let t = 2; t < s.l; t += 6) put(t, o, 2.6, 0.14, WHITE);
    }
    if (two && n === 1) for (let t = 1; t < s.l; t += 2) put(t, 0, 2.02, 0.12, YELLOW);
    for (let t = 1; t < s.l; t += 2) { put(t, -r.w / 2 + 0.35, 2.02, 0.12, WHITE); put(t, r.w / 2 - 0.35, 2.02, 0.12, WHITE); }
    // halfway to the carriageway in the other direction: road without a gap and a double yellow line
    if (r.one) for (let t = 1; t < s.l; t += 2) {
      const x = s.a[0] + s.dx * t, z = s.a[1] + s.dz * t;
      let best = null, bd = 34;
      for (const q of ix.at(x, z)) {
        if (q.id === id || !q.r.one || q.r.rank < 2 || q.dx * s.dx + q.dz * s.dz > -0.9) continue;
        const along = (x - q.a[0]) * q.dx + (z - q.a[1]) * q.dz;
        if (along < -3 || along > q.l + 3) continue;
        const d = ix.dist(q, x, z);
        if (d < bd && d < r.w / 2 + q.r.w / 2 + 12) { bd = d; best = q; }
      }
      if (!best) continue;
      const side = Math.sign((best.a[0] - x) * nx + (best.a[1] - z) * nz) || 1, o = side * (bd / 2 - 0.15), px = x + nx * o, pz = z + nz * o;
      const ex = x + nx * side * bd, ez = z + nz * side * bd;
      quad(fill, [[x - s.dx * 1.01, z - s.dz * 1.01], [x + s.dx * 1.01, z + s.dz * 1.01], [ex + s.dx * 1.01, ez + s.dz * 1.01], [ex - s.dx * 1.01, ez - s.dz * 1.01]]);
      if (!stop(px, pz) && !ix.at(px, pz).some(q => Math.abs(q.dx * s.dx + q.dz * s.dz) < 0.9 && q.r.rank >= 2 && ix.dist(q, px, pz) < q.r.w / 2) && !ix.at(px, pz).some(q => q.r.k === 'busway' && ix.dist(q, px, pz) < q.r.w / 2)) {
        strip(paint, [px - s.dx * 1.01, pz - s.dz * 1.01], [px + s.dx * 1.01, pz + s.dz * 1.01], 0.12, YELLOW);
      }
    }
  }
}
// Bars of a crossing. (wx, wz) is the way people walk.
const bar = (paint, x, z, wx, wz, len) => strip(paint, [x - wz * len / 2, z + wx * len / 2], [x + wz * len / 2, z - wx * len / 2], 0.5, WHITE);

/* ---- textures ---- */
const TEX = {
  ground: [12, (g, n) => { g.fillStyle = '#8f8d87'; g.fillRect(0, 0, n, n); speck(g, n, 9000, ['#8a8882', '#95938c', '#85837d'], 2); g.strokeStyle = 'rgba(60,58,54,.22)'; g.lineWidth = 3; g.strokeRect(0, 0, n, n); }],
  walk: [3.2, (g, n, r) => {
    g.fillStyle = '#a39c92'; g.fillRect(0, 0, n, n);
    for (let y = 0; y < 16; y++) for (let x = -1; x < 8; x++) { const c = 150 + r(-12, 12) | 0; g.fillStyle = `rgb(${c + 6},${c},${c - 9})`; g.fillRect(x * n / 8 + (y % 2) * n / 16 + 1, y * n / 16 + 1, n / 8 - 2, n / 16 - 2); }
  }],
  alley: [8, (g, n, r) => { g.fillStyle = '#71716d'; g.fillRect(0, 0, n, n); speck(g, n, 16000, ['#6b6b67', '#777772', '#666662'], 1.6); for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(40,40,40,.16)'; g.fillRect(r(0, n), r(0, n), r(20, 70), r(14, 50)); } }],
  road: [8, (g, n) => { g.fillStyle = '#58595b'; g.fillRect(0, 0, n, n); speck(g, n, 20000, ['#525355', '#5e5f61', '#636465', '#4f5052'], 1.6); }],
};
function material(kind, order) {
  const [m, draw] = TEX[kind], map = canvasTexture(512, draw);
  const mat = new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetUnits: -order * 2 });
  map.repeat.set(1 / m, 1 / m);
  return mat;
}
function flatMesh(L, mat, y, order) {
  const g = new THREE.BufferGeometry(), n = L.p.length / 3, uv = new Float32Array(n * 2), nm = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { uv[i * 2] = L.p[i * 3]; uv[i * 2 + 1] = L.p[i * 3 + 2]; nm[i * 3 + 1] = 1; }
  g.setAttribute('position', new THREE.Float32BufferAttribute(L.p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (L.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(L.c, 3));
  g.setIndex(L.ix);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y; m.receiveShadow = true; m.renderOrder = -order;   // top layers first, so the ones below are skipped early
  return m;
}

export function buildStreets(data) {
  const group = new THREE.Group(), U = data.unit;
  const roads = data.roads.map(r => ({ ...r, pts: ring(r.p, U), w: r.w * U, s: (r.s || 0) * U, rank: MAIN.has(r.k) ? 3 : CAR.has(r.k) ? (r.w * U >= 9 ? 2 : 1) : 0 }));
  const cars = roads.filter(r => CAR.has(r.k)), ix = index(cars);
  const base = layer(), walk = layer(), curb = layer(), alley = layer(), road = layer(), paint = layer();
  const R = 900;
  quad(base, [[-R, -R], [R, -R], [R, R], [-R, R]]);

  for (const r of roads) {
    if (r.k === 'steps' || r.k === 'crossing') continue;
    if (!CAR.has(r.k)) { if (r.a) polygon(walk, r.pts); else path(r.k === 'platform' ? curb : walk, r.pts, r.k === 'sidewalk' ? Math.max(r.w, 3) : r.w); continue; }
    if (r.a) { polygon(alley, r.pts); continue; }
    if (r.s) { path(walk, r.pts, r.w + (r.s + CURB) * 2); path(curb, r.pts, r.w + CURB * 2); }
    path(r.rank === 3 ? road : alley, r.pts, r.w);
  }

  // crossings: mapped walking lines first, then crossing points that have no line
  const spots = [], zebra = (x, z) => spots.some(([a, b]) => Math.hypot(a - x, b - z) < 3.4), inCar = (x, z) => ix.at(x, z).find(s => s.r.w >= 5 && ix.dist(s, x, z) < s.r.w / 2 - 0.2);
  for (const r of roads) {
    if (r.k !== 'crossing') continue;
    for (let i = 1; i < r.pts.length; i++) {
      const [a, b] = [r.pts[i - 1], r.pts[i]], l = Math.hypot(b[0] - a[0], b[1] - a[1]), wx = (b[0] - a[0]) / l, wz = (b[1] - a[1]) / l;
      for (let t = 0.5; t < l; t++) {
        const x = a[0] + wx * t, z = a[1] + wz * t, s = inCar(x, z);
        if (!s || Math.abs(s.dx * wx + s.dz * wz) > 0.75) continue;   // not along the road
        spots.push([x, z]);
        bar(paint, x, z, wx, wz, s.r.rank === 3 ? 5 : 3.4);
      }
    }
  }
  for (const c of data.crossings) {
    const x = c.x * U, z = c.z * U;
    if (spots.some(([a, b]) => Math.hypot(a - x, b - z) < 7)) continue;
    const s = ix.at(x, z).filter(q => q.r.w >= 5 && ix.dist(q, x, z) < 1.5).sort((p, q) => q.r.w - p.r.w)[0];
    if (!s) continue;
    const wx = -s.dz, wz = s.dx, n = Math.floor(s.r.w - 0.6);
    for (let i = 0; i < n; i++) { const o = i - (n - 1) / 2; spots.push([x + wx * o, z + wz * o]); bar(paint, x + wx * o, z + wz * o, wx, wz, s.r.rank === 3 ? 5 : 3.4); }
  }
  const cross = junctions(cars);
  for (const [x, z, d] of cross) disc(road, [x, z], d);
  const noPaint = (x, z) => zebra(x, z) || cross.some(([a, b, d]) => Math.hypot(a - x, b - z) < d);
  cars.forEach((r, id) => { if (!r.a) lanes(paint, road, ix, r, id, noPaint); });

  const add = (L, mat, y, order) => { if (L.ix.length) group.add(flatMesh(L, mat, y, order)); };
  add(base, material('ground', 0), 0, 0);
  add(walk, material('walk', 1), 0.012, 1);
  add(curb, new THREE.MeshLambertMaterial({ color: 0xb9b6ae, polygonOffset: true, polygonOffsetUnits: -4 }), 0.02, 2);
  add(alley, material('alley', 3), 0.03, 3);
  add(road, material('road', 4), 0.04, 4);
  add(paint, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetUnits: -10 }), 0.052, 5);
  return { group, stats: { crossingBars: spots.length, paint: paint.ix.length / 3 } };
}
