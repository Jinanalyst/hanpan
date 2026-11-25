// Small modelling kit shared by the soldier and the weapons: rounded boxes, limbs, camouflage, and merging of
// many little parts into a few meshes so a full room of dressed soldiers stays cheap to draw.
import * as THREE from 'three';

const geoCache = new Map();
const cached = (key, make) => { let g = geoCache.get(key); if (!g) { g = make(); g.userData.shared = true; geoCache.set(key, g); } return g; };

export const boxG = (w, h, d, r = 0) => cached(`b${w},${h},${d},${r}`, () => {
  if (!r) return new THREE.BoxGeometry(w, h, d);
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3), p = g.attributes.position, n = g.attributes.normal, H = [w / 2, h / 2, d / 2], v = [0, 0, 0], o = [0, 0, 0];
  r = Math.min(r, ...H.map(x => x * 0.98));
  for (let i = 0; i < p.count; i++) {
    let L = 0;
    for (let k = 0; k < 3; k++) {
      const c = p.array[i * 3 + k], inner = H[k] - r;
      const edge = Math.abs(c) > H[k] * 0.9;
      v[k] = Math.sign(c) * inner; o[k] = edge ? Math.sign(c) : 0;
      L += o[k] * o[k];
    }
    L = Math.sqrt(L) || 1;
    for (let k = 0; k < 3; k++) { p.array[i * 3 + k] = v[k] + o[k] / L * r; n.array[i * 3 + k] = o[k] / L; }
  }
  return g;
});
export const cylG = (r0, r1, h, seg = 14, open = false, a0 = 0, a1 = Math.PI * 2) => cached(`c${r0},${r1},${h},${seg},${open},${a0},${a1}`, () => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open, a0, a1));
export const ballG = (r, part = 1, seg = 18) => cached(`s${r},${part},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.6 | 0), 0, Math.PI * 2, 0, Math.PI * part));
export const capG = (r, l) => cached(`p${r},${l.toFixed(3)}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
export const torusG = (r, t) => cached(`t${r},${t}`, () => new THREE.TorusGeometry(r, t, 8, 22));

export function part(par, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  par.add(m);
  return m;
}
export const box = (par, w, h, d, x, y, z, mat, r = 0, rx = 0, ry = 0, rz = 0) => part(par, boxG(w, h, d, r), mat, x, y, z, rx, ry, rz);
const UP = new THREE.Vector3(0, 1, 0);
// A rounded limb from a to b (arrays).
export function limb(par, a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const m = part(par, capG(r, Math.max(0.01, L)), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

/* ---- materials ---- */
const mats = new Map();
export function mat(color, rough = 0.9, metal = 0, o) {
  const key = `${color}:${rough}:${metal}:${o ? JSON.stringify(o) : ''}`;
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...o }); m.userData.shared = true; mats.set(key, m); }
  return m;
}

// Camouflage: base colour, patch colours, plus colours for the helmet and the vest worn with it.
export const CAMO = {
  woodland: { base: '#5d6b3c', c: ['#3a4527', '#7a6a42', '#23281a'], helm: 0x4c5730, vest: 0x3f482b, kind: 'blob' },
  desert: { base: '#c4ab7c', c: ['#a5875a', '#d9c59a', '#8a7048'], helm: 0xb09768, vest: 0x9a8052, kind: 'blob' },
  arctic: { base: '#e4e9ec', c: ['#c3ccd3', '#9aa5ae', '#f6f9fa'], helm: 0xdfe5e8, vest: 0xb4bec5, kind: 'blob' },
  urban: { base: '#80858a', c: ['#5b6065', '#a5aaae', '#3b3f43'], helm: 0x6a6f74, vest: 0x4b5055, kind: 'blob' },
  tiger: { base: '#6f7446', c: ['#23261a', '#3f4a2a', '#23261a'], helm: 0x575c36, vest: 0x3b4128, kind: 'stripe' },
  pixel: { base: '#7f8a62', c: ['#566144', '#a3a67f', '#39402f'], helm: 0x68724f, vest: 0x545d40, kind: 'pixel' },
  night: { base: '#2b2e33', c: ['#202226', '#3a3e45', '#17181b'], helm: 0x26282c, vest: 0x1b1d20, kind: 'blob' },
  ember: { base: '#3a1d18', c: ['#8f2f1d', '#5c241a', '#d0602c'], helm: 0x3a1d18, vest: 0x3a1d18, kind: 'stripe' },
};
const tex = new Map();
export function camoMat(id, scale = 1, rough = 0.95, metal = 0) {
  const key = `${id}:${scale}:${rough}`;
  if (mats.has(key)) return mats.get(key);
  let img = tex.get(id);
  if (!img) { img = drawCamo(CAMO[id]); tex.set(id, img); }
  const t = new THREE.CanvasTexture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(scale); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: rough, metalness: metal });
  m.userData.shared = true;
  mats.set(key, m);
  return m;
}
function drawCamo({ base, c, kind }) {
  const S = 128, cv = document.createElement('canvas'), g = cv.getContext('2d');
  cv.width = cv.height = S;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // same pattern on every screen
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const wrap = (x, y, f) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(x + ox, y + oy); f(); g.restore(); } };
  if (kind === 'pixel') {
    for (let i = 0; i < 130; i++) {
      g.fillStyle = c[i % 3];
      const x = (rnd() * 32 | 0) * 4, y = (rnd() * 32 | 0) * 4, n = 3 + rnd() * 7 | 0;
      const cells = Array.from({ length: n }, () => [(rnd() * 4 | 0) * 4, (rnd() * 3 | 0) * 4]);
      for (const [a, b] of cells) g.fillRect((x + a) % S, (y + b) % S, 4, 4);
    }
  } else if (kind === 'stripe') {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = c[i % 3];
      const w = 22 + rnd() * 38, h = 3 + rnd() * 5, a = (rnd() - 0.5) * 0.5;
      wrap(rnd() * S, i * 5, () => { g.rotate(a); g.beginPath(); g.moveTo(-w / 2, 0); g.quadraticCurveTo(0, -h, w / 2, 1); g.quadraticCurveTo(0, h, -w / 2, 0); g.fill(); });
    }
  } else {
    for (let i = 0; i < 42; i++) {
      g.fillStyle = c[i % 3];
      const blobs = Array.from({ length: 4 }, () => [(rnd() - 0.5) * 18, (rnd() - 0.5) * 12, 4 + rnd() * 8, 3 + rnd() * 6, rnd() * 3]);
      wrap(rnd() * S, rnd() * S, () => { for (const [x, y, a, b, r] of blobs) { g.beginPath(); g.ellipse(x, y, a, b, r, 0, 7); g.fill(); } });
    }
  }
  return cv;
}

/* ---- merge ---- */
// Plain materials become one: colour, roughness, metalness and glow move into the points, so the look stays and a soldier is a few draw calls.
const PLAIN = new THREE.MeshStandardMaterial({ vertexColors: true });
PLAIN.userData.shared = true;
PLAIN.onBeforeCompile = s => {
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aRM; attribute vec3 aGlow; varying vec2 vRM; varying vec3 vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM; vGlow = aGlow;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM; varying vec3 vGlow;')
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
    .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vGlow;');
};
const isPlain = m => m?.isMeshStandardMaterial && !m.map && !m.transparent && m.side === THREE.FrontSide && !m.vertexColors;
// Replaces the direct children of a group (and their children) with one mesh per material. Groups marked keep stay.
// This runs whenever a soldier appears, in the middle of a match, so it makes as little garbage as it can.
const nm = new THREE.Matrix3();
export function bake(g, shadow = true) {
  const bins = new Map(), inv = new THREE.Matrix4();
  g.updateWorldMatrix(true, false);
  inv.copy(g.matrixWorld).invert();
  (function walk(o) {
    for (const c of o.children) {
      if (c.userData.keep) continue;
      if (c.isMesh) {
        c.updateWorldMatrix(true, false);
        const m = c.material, plain = isPlain(m), key = plain ? PLAIN : m;
        let b = bins.get(key);
        if (!b) bins.set(key, b = { n: 0, list: [] });
        b.n += c.geometry.index ? c.geometry.index.count : c.geometry.attributes.position.count;
        b.list.push({ geo: c.geometry, m, M: new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld) });
      }
      walk(c);
    }
  })(g);
  for (const c of g.children.filter(c => !c.userData.keep)) g.remove(c);
  for (const [m, b] of bins) {
    const geo = new THREE.BufferGeometry(), make = (name, size) => { const a = new Float32Array(b.n * size); geo.setAttribute(name, new THREE.BufferAttribute(a, size)); return a; };
    const out = { p: make('position', 3), n: make('normal', 3), uv: make('uv', 2) };
    const col = m === PLAIN && { c: make('color', 3), rm: make('aRM', 2), gl: make('aGlow', 3) };
    let at = 0;
    for (const q of b.list) {
      const end = add(out, at, q.geo, q.M);
      if (col) {
        const { color: c, emissive: e, emissiveIntensity: k } = q.m;
        for (let i = at; i < end; i++) {
          col.c[i * 3] = c.r; col.c[i * 3 + 1] = c.g; col.c[i * 3 + 2] = c.b;
          col.rm[i * 2] = q.m.roughness; col.rm[i * 2 + 1] = q.m.metalness;
          col.gl[i * 3] = e.r * k; col.gl[i * 3 + 1] = e.g * k; col.gl[i * 3 + 2] = e.b * k;
        }
      }
      at = end;
    }
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = shadow && !m.transparent;
    g.add(mesh);
  }
  return g;
}
// Writes the triangles of geo, moved by M, from point number `at` on. Returns the number after the last one.
function add(out, at, geo, M) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, ix = geo.index?.array, count = ix ? ix.length : P.length / 3, e = M.elements, w = nm.getNormalMatrix(M).elements, { p, n, uv } = out;
  for (let i = 0; i < count; i++, at++) {
    const s = (ix ? ix[i] : i) * 3, k = at * 3, x = P[s], y = P[s + 1], z = P[s + 2], a = N[s], b = N[s + 1], c = N[s + 2];
    p[k] = e[0] * x + e[4] * y + e[8] * z + e[12]; p[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; p[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    const nx = w[0] * a + w[3] * b + w[6] * c, ny = w[1] * a + w[4] * b + w[7] * c, nz = w[2] * a + w[5] * b + w[8] * c, L = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    n[k] = nx / L; n[k + 1] = ny / L; n[k + 2] = nz / L;
    if (i % 3 < 2) continue;
    // pattern laid on in metres, so camouflage has the same size on every part
    const o = k - 6, ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2], vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const ax = Math.abs(uy * vz - uz * vy), ay = Math.abs(uz * vx - ux * vz), az = Math.abs(ux * vy - uy * vx);
    const [u, v] = ax >= ay && ax >= az ? [2, 1] : ay >= az ? [0, 2] : [0, 1];
    for (let q = 0; q < 3; q++) { const t = (at - 2 + q) * 2; uv[t] = p[o + q * 3 + u] * 1.8; uv[t + 1] = p[o + q * 3 + v] * 1.8; }
  }
  return at;
}
// Frees the merged geometry of a model. Materials are shared and stay.
export function dispose(g) {
  g.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
}
