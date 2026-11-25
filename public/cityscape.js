// City scenery: facades, shop fronts, vehicles, the buildings around a city land and its far landmark.
import * as THREE from 'three';

const V = o => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
let seed = 11;
const rnd = (a = 0, b = 1) => a + (seed = (seed * 16807) % 2147483647) / 2147483647 * (b - a);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
/* ---- facades: one texture tile is 8 m wide and 8 m high (two or three floors) ---- */
export const FACADE_M = 8;
const STYLE = {
  fNeon: { wall: '#4a4a58', cols: 5, rows: 3, w: 0.74, h: 0.62, glass: '#1d2333', frame: '#2b2b36', lit: ['#ffe3a0', '#bfe3ff', '#ffd0e8'], p: 0.5, ac: true },
  fSeoul: { wall: '#b9b4b0', cols: 4, rows: 3, w: 0.72, h: 0.58, glass: '#3d4a5c', frame: '#8e8a88', lit: ['#ffe2ad', '#fff1cf'], p: 0.35, ac: true },
  fGlass: { wall: '#5f7d95', cols: 6, rows: 4, w: 0.94, h: 0.86, glass: '#7fa3bd', frame: '#49616f', lit: ['#ffe9c0', '#dff1ff'], p: 0.3, shine: true },
  fBrick: { wall: '#8a4b38', brick: ['#7d4230', '#965642', '#a0604a'], cols: 4, rows: 2, w: 0.46, h: 0.58, glass: '#33404c', frame: '#e2d9c6', sill: '#c9bda6' },
  fStone: { wall: '#b5ab9a', cols: 5, rows: 2, w: 0.54, h: 0.68, glass: '#3a4753', frame: '#8f8674', sill: '#cfc6b5', bands: true },
  fParis: { wall: '#dccfb3', cols: 4, rows: 2, w: 0.42, h: 0.72, glass: '#4a5560', frame: '#f4eedf', sill: '#c4b696', balcony: true, bands: true },
  fTerrace: { wall: '#7b4634', brick: ['#6d3d2d', '#87503c', '#92604b'], cols: 4, rows: 2, w: 0.44, h: 0.62, glass: '#37424c', frame: '#f1eee6', sill: '#e6e0d2', panes: true },
  fSand: { wall: '#dcc9a3', cols: 5, rows: 3, w: 0.56, h: 0.66, glass: '#5d8795', frame: '#c2ac82', sill: '#efe2c4', arch: true },
};
const mats = {};
function facade(kind, night) {
  const key = kind + (night ? 'N' : '');
  if (mats[key]) return mats[key];
  const S = STYLE[kind] || STYLE.fSeoul, N = 512;
  seed = 31 + kind.length * 77 + kind.charCodeAt(1);
  const glow = document.createElement('canvas'); glow.width = glow.height = N;
  const e = glow.getContext('2d'); e.fillStyle = '#000'; e.fillRect(0, 0, N, N);
  const map = canvasTex(N, N, g => {
    g.fillStyle = S.wall; g.fillRect(0, 0, N, N);
    if (S.brick) for (let r = 0; r < 64; r++) for (let i = -1; i < 16; i++) { g.fillStyle = S.brick[rnd(0, 3) | 0]; g.fillRect(i * 32 + (r % 2) * 16 + 1, r * 8 + 1, 30, 6); }
    else for (let i = 0; i < 900; i++) { g.globalAlpha = rnd(0.03, 0.1); g.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; g.fillRect(rnd(0, N), rnd(0, N), rnd(1, 5), rnd(1, 5)); }
    g.globalAlpha = 1;
    const cw = N / S.cols, ch = N / S.rows;
    for (let y = 0; y < S.rows; y++) {
      if (S.bands) { g.fillStyle = S.sill; g.fillRect(0, y * ch, N, 10); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y * ch + 10, N, 3); }
      for (let x = 0; x < S.cols; x++) {
        const w = cw * S.w, h = ch * S.h, X = x * cw + (cw - w) / 2, Y = y * ch + (ch - h) * 0.55, f = S.shine ? 3 : 6;
        g.fillStyle = S.frame; g.fillRect(X - f, Y - f, w + f * 2, h + f * 2);
        if (S.arch) { g.beginPath(); g.arc(X + w / 2, Y, w / 2 + f, Math.PI, 0); g.fill(); }
        const gr = g.createLinearGradient(X, Y, X + w * 0.6, Y + h);
        gr.addColorStop(0, S.glass); gr.addColorStop(0.5, S.shine ? '#a9c8da' : S.glass); gr.addColorStop(1, S.shine ? '#5f8299' : '#20272f');
        g.fillStyle = gr; g.fillRect(X, Y, w, h);
        if (S.arch) { g.beginPath(); g.arc(X + w / 2, Y, w / 2, Math.PI, 0); g.fill(); }
        if (S.lit && night && rnd() < S.p) {
          const c = S.lit[rnd(0, S.lit.length) | 0];
          g.fillStyle = c; g.fillRect(X, Y, w, h); e.globalAlpha = rnd(0.45, 0.95); e.fillStyle = c; e.fillRect(X, Y, w, h); e.globalAlpha = 1;
          const b = rnd(0, 0.5); g.fillStyle = e.fillStyle = 'rgba(40,30,30,.75)'; g.fillRect(X, Y, w, h * b); e.fillRect(X, Y, w, h * b);   // blinds
        }
        g.fillStyle = S.frame;
        if (!S.shine) g.fillRect(X + w / 2 - 2, Y, 4, h);
        if (S.panes) { g.fillRect(X, Y + h / 2 - 2, w, 4); g.fillRect(X + w / 4 - 1, Y, 2, h); g.fillRect(X + w * 0.75 - 1, Y, 2, h); }
        if (S.sill) { g.fillStyle = S.sill; g.fillRect(X - 10, Y + h + f, w + 20, 8); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(X - 10, Y + h + f + 8, w + 20, 4); }
        if (S.balcony) { g.strokeStyle = '#23262a'; g.lineWidth = 3; g.strokeRect(X - 12, Y + h * 0.68, w + 24, h * 0.32 + 4); for (let i = X - 8; i < X + w + 12; i += 8) { g.beginPath(); g.moveTo(i, Y + h * 0.68); g.lineTo(i, Y + h + 4); g.stroke(); } }
        if (S.ac && rnd() < 0.3) { g.fillStyle = '#c9ccd0'; g.fillRect(X + w * 0.1, Y + h + 8, 34, 22); g.fillStyle = '#6a6e74'; g.beginPath(); g.arc(X + w * 0.1 + 14, Y + h + 19, 8, 0, 7); g.fill(); }
      }
    }
  });
  const m = V({ map, roughness: S.shine ? 0.35 : 0.9, metalness: S.shine ? 0.35 : 0 });
  if (night && S.lit) { m.emissiveMap = new THREE.CanvasTexture(glow); m.emissiveMap.wrapS = m.emissiveMap.wrapT = THREE.RepeatWrapping; m.emissiveMap.colorSpace = THREE.SRGBColorSpace; m.emissive.set(0xffffff); m.emissiveIntensity = 0.75; }
  return (mats[key] = m);
}
// Street level: a 9 m by 3.2 m strip of three shops.
function shopfront(v, night) {
  const key = 'shop' + v + (night ? 'N' : '');
  if (mats[key]) return mats[key];
  const AW = [['#b23a2e', '#f1e6cf', '#2f5d7c'], ['#2f6b4a', '#d8b45a', '#7a3550'], ['#32424f', '#c9803a', '#a33b3b']][v % 3];
  const map = canvasTex(768, 256, (g, w, h) => {
    g.fillStyle = '#37332f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const x = i * 256;
      g.fillStyle = '#26221f'; g.fillRect(x + 4, 40, 248, 216);
      const gr = g.createLinearGradient(0, 70, 0, 240); gr.addColorStop(0, night ? '#ffe6b8' : '#8fa3ad'); gr.addColorStop(1, night ? '#c98f4e' : '#3b464d');
      g.fillStyle = gr; g.fillRect(x + 14, 74, 148, 150); g.fillRect(x + 178, 74, 60, 178);
      g.fillStyle = 'rgba(40,28,20,.55)'; for (let k = 0; k < 5; k++) g.fillRect(x + 20 + k * 28, 170 - (k * 37 % 40), 18, 54 + (k * 37 % 40));
      g.fillStyle = '#d8c9a3'; g.fillRect(x + 226, 160, 5, 22);
      g.fillStyle = AW[i]; g.fillRect(x + 4, 8, 248, 34);
      g.fillStyle = 'rgba(255,255,255,.85)'; for (let k = 0; k < 4 + i; k++) g.fillRect(x + 60 + k * 24, 18, 15, 14);   // sign, no real writing
      for (let k = 0; k < 12; k++) { g.fillStyle = k % 2 ? AW[i] : '#efe6d2'; g.beginPath(); g.moveTo(x + 4 + k * 20.7, 42); g.lineTo(x + 4 + (k + 1) * 20.7, 42); g.lineTo(x + 4 + (k + 1) * 20.7, 66); g.arc(x + 4 + (k + 0.5) * 20.7, 66, 10.3, 0, Math.PI); g.fill(); }
    }
  });
  const m = V({ map, roughness: 0.7 });
  if (night) { m.emissive.set(0xffffff); m.emissiveMap = map; m.emissiveIntensity = 0.5; }
  return (mats[key] = m);
}

/* ---- other city kinds ---- */
const CITY = {
  paint: () => V({ color: 0xe9e7de }),
  paving: () => V({ map: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#a5a29b'; g.fillRect(0, 0, w, h); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const c = 158 + rnd(-12, 12) | 0; g.fillStyle = `rgb(${c},${c - 3},${c - 9})`; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); } }) }),
  water: () => V({ color: 0x3d8fa8, roughness: 0.12, metalness: 0.25 }),
  carglass: () => V({ color: 0x1b242b, roughness: 0.15, metalness: 0.5 }),
  vend: () => V({ map: canvasTex(128, 96, (g, w, h) => { g.fillStyle = '#d94436'; g.fillRect(0, 0, w, h); g.fillStyle = '#eef3f6'; g.fillRect(10, 8, 108, 56); for (let i = 0; i < 24; i++) { g.fillStyle = ['#d94436', '#2f7fd6', '#58a846', '#e0b52a'][i % 4]; g.fillRect(16 + i % 8 * 12.6, 13 + (i / 8 | 0) * 17, 8, 12); } g.fillStyle = '#26221f'; g.fillRect(20, 74, 88, 14); }), emissive: 0x442222 }),
  phone: () => V({ map: canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#b3261e'; g.fillRect(0, 0, w, h); g.fillStyle = '#f1eee6'; g.fillRect(10, 6, 44, 10); g.fillStyle = '#a9bcc6'; for (let y = 0; y < 6; y++) for (let x = 0; x < 3; x++) g.fillRect(10 + x * 15, 22 + y * 16, 13, 13); }), roughness: 0.6 }),
  kiosk: () => V({ color: 0x2f5a44, roughness: 0.6 }), dump: () => V({ color: 0x2f5a44, roughness: 0.6, metalness: 0.2 }),
  slate: () => V({ color: 0x59626c, roughness: 0.75 }), limestone: () => V({ color: 0xd9cdb4 }), sandw: () => V({ color: 0xd3bd94 }), redstep: () => V({ color: 0xb8291f, roughness: 0.7 }),
  palm: () => V({ color: 0x8a6d48 }), frond: () => V({ color: 0x4f7a35, side: THREE.DoubleSide }), tyre: () => V({ color: 0x17181a }), light: () => new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), tail: () => new THREE.MeshBasicMaterial({ color: 0xd02a20 }),
  screenA: () => screen([['#ff4fa8', '#5a2fd0'], ['#ffd24a', '#ff6a3d'], ['#3fd8ff', '#1f5fd0']]), screenB: () => screen([['#3fe0b0', '#1f7fd0'], ['#f2f2f2', '#9fb4ff'], ['#ff7a5a', '#b0208a']]),
  fTop: () => V({ color: 0x77777a }),
};
function screen(p) {   // advertising screen with abstract shapes
  return new THREE.MeshBasicMaterial({ map: canvasTex(256, 128, (g, w, h) => {
    p.forEach(([a, b], i) => { const gr = g.createLinearGradient(i * 86, 0, i * 86 + 86, h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(i * 86, 0, 86, h); });
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(43, 60, 26, 0, 7); g.fill(); for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(96 + i * 17, 92); g.lineTo(106 + i * 17, 92); g.lineTo(118 + i * 14, 34); g.lineTo(108 + i * 14, 34); g.fill(); }
    g.beginPath(); g.moveTo(190, 96); g.lineTo(214, 28); g.lineTo(240, 96); g.fill();
  }) });
}
export function cityMat(kind) {
  if (mats[kind]) return mats[kind];
  if (kind.startsWith('car-') || kind.startsWith('bus-')) return (mats[kind] = V({ color: parseInt(kind.slice(4), 16), roughness: 0.35, metalness: 0.25 }));
  return CITY[kind] ? (mats[kind] = CITY[kind]()) : null;
}
// The wall around a city land: a closed row of shops.
export function cityWall(g, w, h, d, x, z, i, night) {
  mesh(g, sides(w, h, d, 13, h), shopfront(i, night), x, h / 2, z);
  mesh(g, box(w + 0.3, 0.3, d + 0.3), cityMat('fTop'), x, h + 0.1, z);
}
export const isCityKind = k => k[0] === 'f' && !!STYLE[k] || k.startsWith('car-') || k.startsWith('bus-') || k === 'palm';

/* ---- boxes that need more than one mesh ---- */
// uv in metres. Only the four sides when open is true.
function sides(w, h, d, sx, sy, vOff = 0) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, span = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * span[f] / sx, (uv.getY(k) * h + vOff) / sy); }
  const ix = [...g.index.array].filter((_, i) => { const f = i / 6 | 0; return f < 2 || f > 3; });
  g.setIndex(ix);
  return g;
}
function mesh(g, geo, m, x, y, z, shadow = true) {
  const q = new THREE.Mesh(geo, m); q.position.set(x, y, z); q.castShadow = q.receiveShadow = shadow; g.add(q); return q;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export function facadeBox(g, kind, w, h, d, x, y0, z, night, shadow, shop = true) {
  const s = shop && h > 5 ? Math.round(x * 7 + z * 3) : 0, base = shop && h > 5 ? 3.2 : 0;
  mesh(g, sides(w, h, d, FACADE_M, FACADE_M), facade(kind, night), x, y0 + h / 2, z, shadow);
  if (base) mesh(g, sides(w + 0.08, base, d + 0.08, 9, base), shopfront(Math.abs(s), night), x, y0 + base / 2, z, shadow);
  if (base) mesh(g, box(w + 0.5, 0.22, d + 0.5), cityMat('fTop'), x, y0 + base + 0.11, z, shadow);
  mesh(g, box(w + 0.4, 0.5, d + 0.4), cityMat('fTop'), x, y0 + h + 0.05, z, shadow);
  if (h > 9 && w > 7 && d > 7) { mesh(g, box(2.4, 1.6, 2), cityMat('fTop'), x + w * 0.2, y0 + h + 1, z - d * 0.15, shadow); mesh(g, new THREE.CylinderGeometry(1.1, 1.1, 2, 12), cityMat('fTop'), x - w * 0.25, y0 + h + 1.2, z + d * 0.2, shadow); }
}
// Draws a city box and returns true, or returns false for the normal drawing.
export function drawCityBox(g, b, w, h, d, x, z, night) {
  const k = b.kind, y0 = b.min[1];
  if (STYLE[k]) { facadeBox(g, k, w, h, d, x, y0, z, night, true, true); return true; }
  const isCar = k.startsWith('car-') && h < 1, isBus = k.startsWith('bus-');
  if (isCar || isBus) {
    const long = d > w, L = Math.max(w, d), W = Math.min(w, d), c = new THREE.Group();
    c.position.set(x, y0, z); if (!long) c.rotation.y = Math.PI / 2;
    const low = isBus ? 0.35 : 0.25;
    mesh(c, box(W, h - low, L), cityMat(k), 0, low + (h - low) / 2, 0);
    const rail = isBus && h < 2.8;                                       // a train on the viaduct
    for (const s of [-1, 1]) {
      for (const o of isBus ? [-0.32, 0.3] : [-0.31, 0.31]) { if (rail) continue; const t = mesh(c, new THREE.CylinderGeometry(isBus ? 0.5 : 0.36, isBus ? 0.5 : 0.36, 0.26, 14), cityMat('tyre'), s * (W / 2 - 0.1), isBus ? 0.5 : 0.36, o * L); t.rotation.z = Math.PI / 2; }
      mesh(c, box(0.34, 0.16, 0.06), cityMat('light'), s * W * 0.34, isBus ? 0.8 : h * 0.68, -L / 2, false); mesh(c, box(0.34, 0.14, 0.06), cityMat('tail'), s * W * 0.34, isBus ? 0.8 : h * 0.7, L / 2, false);
    }
    if (isBus) {
      for (const y of h > 4 ? [1.55, 3.3] : [1.75]) { mesh(c, box(W + 0.04, 0.85, L * 0.9), cityMat('carglass'), 0, y, 0); mesh(c, box(W * 0.86, 0.95, L + 0.04), cityMat('carglass'), 0, y, 0); }
      mesh(c, box(W + 0.05, 0.12, L + 0.05), cityMat('paint'), 0, h > 4 ? 2.45 : 1.15, 0);
    } else mesh(c, box(W + 0.03, 0.12, L + 0.08), cityMat('tyre'), 0, 0.34, 0);
    g.add(c);
    return true;
  }
  if (k === 'palm') {
    mesh(g, new THREE.CylinderGeometry(w * 0.28, w * 0.45, h, 9), cityMat('palm'), x, y0 + h / 2, z);
    for (let i = 0; i < 9; i++) {   // fronds sit above head height
      const a = i / 9 * Math.PI * 2, f = new THREE.Group(); f.position.set(x, y0 + h, z); f.rotation.y = a;
      const p1 = mesh(f, box(0.5, 0.05, 1.5), cityMat('frond'), 0, 0.18, 0.7); p1.rotation.x = -0.25;
      const p2 = mesh(f, box(0.38, 0.05, 1.4), cityMat('frond'), 0, 0.02, 2.0); p2.rotation.x = 0.5;
      g.add(f);
    }
    return true;
  }
  return false;
}

/* ---- around the land ---- */
export function cityRing(g, [hx, hz], kinds, night) {
  seed = 97 + hx * 13 + hz;
  for (const [depth, off, lo, hi] of [[11, 1.2, 9, 20], [14, 17, 16, 38]]) {
    for (const side of [0, 1, 2, 3]) {
      if (side === 3 && off > 10) continue;   // open to the landmark
      const along = side < 2 ? hx + off + 4 : hz + off + 4;
      for (let p = -along; p < along;) {
        const w = Math.min(rnd(8, 15), along - p + 3), h = side === 3 ? rnd(7, 12) : rnd(lo, hi), c = p + w / 2, q = (side < 2 ? hz : hx) + off + depth / 2, s = side % 2 ? 1 : -1;
        const kind = kinds[rnd(0, kinds.length) | 0];
        if (side < 2) facadeBox(g, kind, w - 0.3, h, depth, c, 0, s * q, night, false, false); else facadeBox(g, kind, depth, h, w - 0.3, s * q, 0, c, night, false, false);
        p += w;
      }
    }
  }
}
const flat = (c, o) => V({ color: c, fog: true, ...o });
// Big shapes behind the skyline, drawn from simple solids.
export function landmark(shape, night) {
  const g = new THREE.Group(), add = (geo, m, x, y, z) => mesh(g, geo, m, x, y, z, false), glow = (c, i) => flat(c, night ? { emissive: c, emissiveIntensity: i } : {});
  const leg = (x0, z0, y0, x1, z1, y1, r, m) => { const A = new THREE.Vector3(x0, y0, z0), B = new THREE.Vector3(x1, y1, z1), q = add(new THREE.CylinderGeometry(r * 0.8, r, A.distanceTo(B), 6), m, 0, 0, 0); q.position.copy(A).add(B).multiplyScalar(0.5); q.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize()); };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const tower = (R, prof, mAt, r) => prof.slice(1).forEach(([y, w], i) => {   // lattice tower from height and half-width steps
    const [y0, w0] = prof[i], m = mAt(i);
    corners.forEach(([a, b], k) => { const [c, d] = corners[(k + 1) % 4]; leg(a * w0, b * w0, y0, a * w, b * w, y, r, m); leg(a * w0, b * w0, y0, c * w, d * w, y, r * 0.5, m); leg(c * w0, d * w0, y0, a * w, b * w, y, r * 0.5, m); leg(a * w, b * w, y, c * w, d * w, y, r * 0.6, m); });
  });
  if (shape === 'lattice') {
    const o = glow(0xe0522a, 0.75), w = glow(0xf1ece2, 0.5);
    tower(0, [[0, 15], [12, 11], [24, 7.6], [36, 5], [48, 3.4], [60, 2.4], [70, 1.6]], i => (i % 2 ? w : o), 0.8);
    add(box(11, 4, 11), w, 0, 38, 0); add(box(6, 3, 6), w, 0, 61, 0); add(new THREE.CylinderGeometry(0.3, 0.8, 20, 8), o, 0, 80, 0);
  } else if (shape === 'iron') {
    const m = flat(0x6f5a45), prof = [[0, 18], [8, 14], [18, 10.5], [30, 7], [44, 4.6], [60, 2.6], [78, 1.2]];
    tower(0, prof, () => m, 0.9); add(box(24, 2, 24), m, 0, 18, 0); add(box(12, 1.6, 12), m, 0, 37, 0); add(box(4.5, 2.5, 4.5), m, 0, 78, 0); add(new THREE.CylinderGeometry(0.2, 0.5, 8, 6), m, 0, 83, 0);
    for (const t of [0, Math.PI / 2]) for (const s of [-1, 1]) { const a = add(new THREE.TorusGeometry(11, 0.6, 6, 18, Math.PI), m, 0, 6, 0); a.rotation.y = t; a.position.set(t ? s * 13 : 0, 5, t ? 0 : s * 13); }
  } else if (shape === 'hilltower') {
    add(new THREE.ConeGeometry(52, 34, 22), flat(0x3f5540), 0, 17, 0); add(new THREE.ConeGeometry(40, 22, 18), flat(0x47604a), 34, 10, 26);
    add(new THREE.CylinderGeometry(1.7, 2.6, 34, 12), flat(0xd9d9de), 0, 48, 0); add(new THREE.CylinderGeometry(5.4, 3.6, 4, 18), glow(0x6fb8ff, 0.8), 0, 62, 0); add(new THREE.CylinderGeometry(4, 5.4, 4, 18), flat(0xe6e6ea), 0, 66, 0); add(new THREE.CylinderGeometry(0.3, 0.9, 20, 8), glow(0xe5533d, 0.5), 0, 78, 0);
  } else if (shape === 'deco') {
    const f = facade('fStone', night), s = (w, h, y) => { const q = add(sides(w, h, w, 8, 8), f, 0, y + h / 2, 0); q.position.y = y + h / 2; add(box(w, 0.6, w), cityMat('fTop'), 0, y + h, 0); };
    s(24, 24, 0); s(18, 26, 24); s(14, 14, 50); s(10, 8, 64); s(6, 6, 72); add(new THREE.CylinderGeometry(0.3, 1.6, 20, 10), flat(0xaeb6bd, { metalness: 0.4, roughness: 0.4 }), 0, 88, 0);
    for (const [x, z, w, h] of [[-26, 22, 14, 52], [8, -34, 13, 44], [26, 30, 12, 60], [-14, 48, 15, 38]]) { const q = mesh(g, sides(w, h, w, 8, 8), facade('fGlass', night), x, h / 2, z, false); q.castShadow = false; add(box(w, 0.6, w), cityMat('fTop'), x, h, z); }
  } else if (shape === 'clock') {
    const st = flat(0xb39a68), dk = flat(0x4a4f52); add(box(9, 44, 9), st, 0, 22, 0); for (let y = 6; y < 40; y += 6) add(box(9.6, 0.6, 9.6), flat(0x9b8455), 0, y, 0);
    add(box(10.4, 11, 10.4), st, 0, 48, 0);
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = add(new THREE.CylinderGeometry(4, 4, 0.4, 26), flat(0xf3efe2, { emissive: 0xfff2cc, emissiveIntensity: 0.4 }), x * 5.3, 48, z * 5.3); if (x) c.rotation.z = Math.PI / 2; else c.rotation.x = Math.PI / 2; for (const [len, a] of [[2.8, 0.6], [2, 2.4]]) { const hnd = add(box(x ? 0.3 : 0.4, len, x ? 0.4 : 0.3), dk, x * 5.65, 48, z * 5.65); if (x) { hnd.rotation.x = a; hnd.position.z += Math.sin(a) * len / 2; } else { hnd.rotation.z = a; hnd.position.x -= Math.sin(a) * len / 2; } hnd.position.y += Math.cos(a) * len / 2; } }
    add(new THREE.ConeGeometry(7.4, 14, 4), dk, 0, 60.5, 0).rotation.y = Math.PI / 4; add(new THREE.CylinderGeometry(0.15, 0.3, 7, 6), flat(0xd8b45a), 0, 70, 0);
    const wh = new THREE.Group(), m = flat(0xe3e6e8); wh.position.set(6, 27, -46); wh.rotation.y = Math.PI / 2 - 0.4; mesh(wh, new THREE.TorusGeometry(25, 0.6, 6, 48), m, 0, 0, 0, false); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, sp = mesh(wh, box(0.15, 25, 0.15), m, Math.cos(a) * 12.5, Math.sin(a) * 12.5, 0, false); sp.rotation.z = a - Math.PI / 2; mesh(wh, new THREE.SphereGeometry(1.4, 8, 6), m, Math.cos(a) * 26.4, Math.sin(a) * 26.4, 0, false); } g.add(wh); for (const s of [-1, 1]) leg(6 + s * 3, -46 + s * 12, 0, 6, -46, 27, 0.9, m);
  } else if (shape === 'needle') {
    const m = flat(0xb9c6cf, { roughness: 0.35, metalness: 0.4 });
    [[15, 26], [12, 24], [9, 22], [6.4, 18], [4, 14]].reduce((y, [r, h], i) => { for (let k = 0; k < 3; k++) { const a = k * 2.094 + i * 0.5; add(new THREE.CylinderGeometry(r * 0.5, r * 0.55, h * (1 - k * 0.12), 12), m, Math.cos(a) * r * 0.5, y + h * (1 - k * 0.12) / 2, Math.sin(a) * r * 0.5); } return y + h * 0.82; }, 0);
    add(new THREE.CylinderGeometry(0.2, 2, 34, 10), m, 0, 100, 0);
    for (const [x, z, w, h] of [[-20, 34, 11, 48], [16, -32, 12, 40], [-6, -52, 13, 54], [24, 24, 10, 36]]) { mesh(g, sides(w, h, w, 8, 8), facade('fGlass', false), x, h / 2, z, false); add(box(w, 0.6, w), cityMat('fTop'), x, h, z); }
  }
  return g;
}

/* ---- one mesh per material, so a detailed land stays cheap to draw ---- */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const bins = new Map(), inv = root.matrixWorld.clone().invert(), M = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), gone = [];
  root.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const key = o.material.uuid + o.castShadow + o.receiveShadow;
    let b = bins.get(key);
    if (!b) bins.set(key, b = { m: o.material, cast: o.castShadow, recv: o.receiveShadow, p: [], n: [], uv: [], ix: [] });
    const geo = o.geometry, P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, base = b.p.length / 3;
    M.multiplyMatrices(inv, o.matrixWorld); nm.getNormalMatrix(M);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(M); b.p.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); b.n.push(v.x, v.y, v.z);
      b.uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) b.ix.push(base + geo.index.getX(i)); else for (let i = 0; i < P.count; i++) b.ix.push(base + i);
    gone.push(o);
  });
  for (const o of gone) { o.geometry.dispose(); o.removeFromParent(); }
  for (const b of bins.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); geo.setIndex(b.ix);
    const q = new THREE.Mesh(geo, b.m); q.castShadow = b.cast; q.receiveShadow = b.recv; root.add(q);
  }
}
