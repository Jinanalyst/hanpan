// Turns the middle of a city into a place to fight: collision boxes, a fence around it, vehicles and street furniture for cover, and spawns.
// Everything the server and the clients must agree on is decided here, once, and stored in the city's file.
import { ring, area, isBox, fitBox } from '../../public/shared/osmgeo.js';
import { boxGrid, rayMap } from '../../public/shared/physics.js';
import { buildNav } from '../../public/shared/map.js';
import { car, bus, lamp, subway } from '../../public/shared/landkit.js';

const CELL = 0.25;                                   // metres, how finely slanted walls are cut into boxes
const CARS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service']);
const COLORS = ['d8d9d6', '2b2e33', '8b9096', '7a1f22', '24466b', 'b8b2a2'];
const r2 = v => Math.round(v * 100) / 100;
function random(seed) { let s = seed; return (a = 0, b = 1) => a + (s = s * 16807 % 2147483647) / 2147483647 * (b - a); }
function inside(x, z, p) {
  let r = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) r = !r;
  return r;
}

// One outline as axis-aligned rectangles [x0, z0, x1, z1].
function rectangles(p, holes, lim) {
  const f = fitBox(p), slant = Math.abs(((f.a % (Math.PI / 2)) + Math.PI * 0.75) % (Math.PI / 2) - Math.PI / 4);   // 0 when along the axes
  const xs = p.map(q => q[0]), zs = p.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  if (!holes.length && isBox(p, f) && slant * Math.max(f.w, f.d) < 0.35) return [[x0, z0, x1, z1]];
  const a0 = Math.max(x0, -lim), b0 = Math.max(z0, -lim), nx = Math.ceil((Math.min(x1, lim) - a0) / CELL), nz = Math.ceil((Math.min(z1, lim) - b0) / CELL);
  if (nx <= 0 || nz <= 0) return [];
  const on = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = a0 + (i + 0.5) * CELL, z = b0 + (j + 0.5) * CELL; if (inside(x, z, p) && !holes.some(h => inside(x, z, h))) on[i * nz + j] = 1; }
  // the biggest rectangle first, so long walls stay in one piece
  const out = [], run = new Int32Array(nx * nz);
  for (;;) {
    let best = 0, bi = 0, bj = 0, bw = 0, bh = 0;
    for (let i = 0; i < nx; i++) for (let j = nz - 1; j >= 0; j--) run[i * nz + j] = on[i * nz + j] ? 1 + (j + 1 < nz ? run[i * nz + j + 1] : 0) : 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      let h = run[i * nz + j];
      for (let k = i; k < nx && h > 0 && h * (nx - i) > best; k++) { h = Math.min(h, run[k * nz + j]); if (h * (k - i + 1) > best) { best = h * (k - i + 1); bi = i; bj = j; bw = k - i + 1; bh = h; } }
    }
    if (best < 3) break;   // crumbs
    for (let i = bi; i < bi + bw; i++) for (let j = bj; j < bj + bh; j++) on[i * nz + j] = 0;
    out.push([a0 + bi * CELL, b0 + bj * CELL, a0 + (bi + bw) * CELL, b0 + (bj + bh) * CELL]);
  }
  return out;
}

export const toBox = ([x, z, sx, sz, h, kind, y0 = 0]) => ({ min: [x - sx / 2, y0, z - sz / 2], max: [x + sx / 2, y0 + h, z + sz / 2], kind });

export function buildArena(city, steps) {
  const U = city.unit, H = Math.round(city.play * Math.sqrt(Math.PI) / 2), rnd = random(4711);   // a square with the area of the circle
  // buildings
  const solids = [];
  for (const b of city.buildings) {
    const p = ring(b.p, U), xs = p.map(q => q[0]), zs = p.map(q => q[1]);
    if (Math.min(...xs) > H + 3 || Math.max(...xs) < -H - 3 || Math.min(...zs) > H + 3 || Math.max(...zs) < -H - 3) continue;
    for (const [a, c, d, e] of rectangles(p, (b.o || []).map(h => ring(h, U)), H + 6)) if (a < H + 3 && d > -H - 3 && c < H + 3 && e > -H - 3) solids.push([r2(a), r2(c), r2(d), r2(e), r2(b.h * U), r2((b.b || 0) * U)]);
  }
  const blocks = (x, z, r = 0) => solids.some(s => s[5] < 2 && x + r > s[0] && x - r < s[2] && z + r > s[1] && z - r < s[3]);

  // fence wherever the edge is not a building
  const props = [];
  for (const side of [-1, 1]) for (const along of [0, 1]) {
    let from = null;
    for (let t = -H; t <= H + 0.2; t += 0.25) {
      const open = t <= H && !blocks(along ? side * H : t, along ? t : side * H, 0.05);
      if (open && from === null) from = t;
      if (!open && from !== null) {
        const a = from - 0.3, b = t + 0.3, n = Math.max(1, Math.round((b - a) / 12));
        for (let i = 0; i < n; i++) { const c = a + (b - a) * (i + 0.5) / n, l = (b - a) / n; props.push(along ? [side * H, c, 0.3, l, 3.2, 'hoard'] : [c, side * H, l, 0.3, 3.2, 'hoard']); }
        from = null;
      }
    }
  }

  // cover
  const taken = [], roads = city.roads.filter(r => CARS.has(r.k) && !r.a).map(r => ({ ...r, pts: ring(r.p, U), w: r.w * U, s: (r.s || 0) * U }));
  const free = (x, z, sx, sz, gap) => Math.abs(x) + sx / 2 < H - 1 && Math.abs(z) + sz / 2 < H - 1 &&
    !solids.some(s => s[5] < 3 && x + sx / 2 + gap > s[0] && x - sx / 2 - gap < s[2] && z + sz / 2 + gap > s[1] && z - sz / 2 - gap < s[3]) &&
    !taken.some(t => Math.abs(x - t[0]) < (sx + t[2]) / 2 + gap && Math.abs(z - t[1]) < (sz + t[3]) / 2 + gap);
  const put = (x, z, sx, sz, gap, list) => { if (!free(x, z, sx, sz, gap)) return false; taken.push([x, z, sx, sz]); props.push(...list.map(q => q.map(v => (typeof v === 'number' ? r2(v) : v)))); return true; };
  const walk = (r, gap, use) => {
    for (let i = 1; i < r.pts.length; i++) {
      const [a, b] = [r.pts[i - 1], r.pts[i]], l = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
      for (let t = rnd(1, gap()); t < l; t += gap()) use(a[0] + dx * t, a[1] + dz * t, dx, dz);
    }
  };
  for (const [x, z] of steps || []) put(x, z, 3.6, 4.6, 1.2, subway(x, z));
  // roadworks: screens across the widest streets, high enough to block the view
  for (const r of [...roads].filter(q => q.w >= 9)) walk(r, () => rnd(17, 24), (x, z, dx, dz) => {
    const o = rnd(-0.45, 0.45) * r.w, px = x - dz * o, pz = z + dx * o, w = rnd(5, 8);
    if (Math.abs(dz) > 0.96) put(px, pz, w, 0.3, 1.6, [[px, pz, w, 0.3, 2.3, 'hoard']]); else if (Math.abs(dx) > 0.96) put(px, pz, 0.3, w, 1.6, [[px, pz, 0.3, w, 2.3, 'hoard']]);
  });
  for (const r of [...roads].sort((p, q) => q.w - p.w)) {
    const big = r.w >= 9, n = Math.max(1, r.n || Math.round(r.w / 3.2));
    walk(r, () => (big ? rnd(5, 9) : rnd(22, 34)), (x, z, dx, dz) => {
      const along = Math.abs(dz) > 0.96, across = Math.abs(dx) > 0.96;   // only streets along the axes: boxes cannot be turned
      if (!along && !across) return;
      const lane = big ? (Math.floor(rnd(0, n)) + 0.5) / n * r.w - r.w / 2 : (rnd() < 0.5 ? -1 : 1) * Math.max(0, r.w / 2 - 1.2), px = x - dz * lane, pz = z + dx * lane, k = rnd();
      if (big && k < 0.3) put(px, pz, along ? 2.5 : 9, along ? 9 : 2.5, 1.5, bus(px, pz, ['2f6db0', '2e8b57', 'b8352c', 'c9a227'][Math.floor(rnd(0, 4))], across, 3));
      else if (big && k < 0.46) put(px, pz, along ? 2.5 : 6.1, along ? 6.1 : 2.5, 1.5, [[px, pz, along ? 2.5 : 6.1, along ? 6.1 : 2.5, 2.6, 'container']]);
      else put(px, pz, along ? 1.9 : 4.4, along ? 4.4 : 1.9, big ? 1.4 : 1.2, car(px, pz, COLORS[Math.floor(rnd(0, COLORS.length))], across));
    });
  }
  // barriers across the widest streets
  for (const r of roads.filter(q => q.w >= 9)) walk(r, () => rnd(16, 24), (x, z, dx, dz) => {
    const o = rnd(-0.4, 0.4) * r.w, px = x - dz * o, pz = z + dx * o;
    if (Math.abs(dz) > 0.96) put(px, pz, 4, 0.8, 1.3, [[px, pz, 4, 0.8, 1.3, 'barrier']]); else if (Math.abs(dx) > 0.96) put(px, pz, 0.8, 4, 1.3, [[px, pz, 0.8, 4, 1.3, 'barrier']]);
  });
  // street furniture on the pavements
  const onRoad = (x, z) => roads.some(r => r.pts.some((b, i) => { if (!i) return false; const a = r.pts[i - 1], dx = b[0] - a[0], dz = b[1] - a[1], k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k) < r.w / 2 + 0.6; }));
  for (const r of roads.filter(q => q.s >= 3)) for (const side of [-1, 1]) walk(r, () => rnd(6, 10), (x, z, dx, dz) => {
    const o = side * (r.w / 2 + 1.3 + rnd(0, r.s * 0.4)), px = x - dz * o, pz = z + dx * o, along = Math.abs(dz) > 0.7, k = rnd();
    if (onRoad(px, pz)) return;
    if (k < 0.42) put(px, pz, along ? 1.1 : 3, along ? 3 : 1.1, 1.3, [[px, pz, along ? 1.1 : 3, along ? 3 : 1.1, 1.05, 'hedge']]);
    else if (k < 0.56) put(px, pz, 2, 2.4, 1.5, [[px, pz, 2, 2.4, 2.5, 'kiosk']]);
    else if (k < 0.66) put(px, pz, 1.3, 1, 1.3, [[px, pz, 1.3, 1, 1.9, 'vend']]);
    else if (k < 0.8) put(px, pz, 1.2, 1.2, 1.3, [[px, pz, 1.2, 1.2, 1.2, 'crate']]);
    else put(px, pz, 0.6, 0.6, 1.2, lamp(px, pz));
  });

  // spawns: two places on opposite sides, about as far from the middle on foot, that cannot see each other
  const boxes = [...solids.map(([a, b, c, d, h, y]) => ({ min: [a, y, b], max: [c, h, d], kind: 'building' })), ...props.map(toBox)];
  boxGrid(boxes);
  const nav = buildNav(boxes, H, H), { points, links, main } = nav, start = main.reduce((a, b) => (Math.hypot(...points[b]) < Math.hypot(...points[a]) ? b : a));
  const dist = new Map([[start, 0]]), heap = [[0, start]];
  while (heap.length) {   // walking distance to the middle
    let m = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[m][0]) m = i;
    const [d, k] = heap[m]; heap[m] = heap.at(-1); heap.pop();
    if (d > dist.get(k)) continue;
    for (const q of links[k]) { const e = d + Math.hypot(points[q][0] - points[k][0], points[q][1] - points[k][1]); if (e < (dist.get(q) ?? Infinity)) { dist.set(q, e); heap.push([e, q]); } }
  }
  const sees = (a, b) => { const d = [b[0] - a[0], 0, b[1] - a[1]], L = Math.hypot(...d); return rayMap([a[0], 1.6, a[1]], d.map(v => v / L), boxes, L) >= L - 0.2; };
  const pick = list => { const out = [list[0]]; while (out.length < 7) { let best = null, bd = 0; for (const q of list) { const d = Math.min(...out.map(o => Math.hypot(points[q][0] - points[o][0], points[q][1] - points[o][1]))); if (d > bd) { bd = d; best = q; } } if (!best || bd < 2.5) return null; out.push(best); } return out; };
  const groups = [];
  for (let x = -H + 10; x <= H - 10; x += 8) for (let z = -H + 10; z <= H - 10; z += 8) {
    if (Math.hypot(x, z) < H * 0.6) continue;
    const list = main.filter(k => Math.hypot(points[k][0] - x, points[k][1] - z) < 11);
    const got = list.length >= 9 && pick(list);
    if (got) groups.push({ x, z, got, d: got.reduce((v, k) => v + dist.get(k), 0) / got.length });
  }
  let best = null;
  for (const A of groups) for (const B of groups) {
    if (A.z >= B.z) continue;
    const apart = Math.hypot(A.x - B.x, A.z - B.z), facing = (A.x * B.x + A.z * B.z) / (Math.hypot(A.x, A.z) * Math.hypot(B.x, B.z));   // -1: opposite
    if (apart < H * 1.2 || facing > -0.75) continue;
    const score = Math.abs(A.d - B.d) * 1.5 + Math.abs((A.d + B.d) / 2 - H) * 0.4 + (1 + facing) * 40;
    if (best && score >= best.score) continue;
    const seen = A.got.reduce((n, a) => n + B.got.filter(b => sees(points[a], points[b])).length, 0);
    if (seen) continue;
    best = { A, B, score };
  }
  if (!best) throw new Error('No fair pair of spawns found');
  const out = g => g.got.map(k => [...points[k], r2(Math.atan2(points[k][0], points[k][1]))]);   // facing the middle
  let total = 0, far = 0, n = 0;   // how far one can see along the streets
  for (let i = 0; i < 400; i++) { const p = points[main[Math.floor(rnd(0, main.length))]]; if (Math.abs(p[0]) > 22 && Math.abs(p[1]) > 22) continue; for (let a = 0; a < 24; a++) { const t = rayMap([p[0], 1.6, p[1]], [Math.cos(a * 0.2618), 0, Math.sin(a * 0.2618)], boxes, 200); total += t; n++; if (t > 60) far++; } }
  return {
    arena: { half: H, solids, props, spawns: { red: out(best.A), blue: out(best.B) } },
    stats: { solids: solids.length, props: props.length, vehicles: taken.length, nav: main.length, walkRed: Math.round(best.A.d), walkBlue: Math.round(best.B.d), seeAvg: Math.round(total / n), seeOver60: +(far / n * 100).toFixed(1) },
  };
}
