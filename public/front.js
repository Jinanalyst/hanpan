// Everything that makes a war front look and sound like one: sea, cliffs, ships, wrecks, smoke, and the planes and
// helicopters the server sends (shared/air.js). Nothing in this file decides what gets hit.
import * as THREE from 'three';
import { BOMBER, flightLife, planeAt, bombAt, bombLands, heliAt, fallTime } from './shared/air.js';
import { rnd, clamp, smooth, nowS, bumps, ctex, dots, uvBox, groundMesh } from './frontkit.js';
import { isWinterKind, drawWinterBox, buildWinter, winterHeight } from './winter.js';
import { part, box, limb, cylG, ballG, torusG, boxG, mat, bake } from './models.js';

/* ---------------- things on the land ---------------- */
const OLIVE = 0x4d5237, BURNT = 0x37322b, RUST = 0x5e4632, STEEL = 0x4b4f52, DARK = 0x1e1d1b, LOG = 0x5b4a36;
let M = null;
function materials(T) {
  if (M) return M;
  const std = o => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, ...o });
  return (M = {
    craft: std({ map: T.metal, color: 0xb4bcc0, roughness: 0.7 }), deck: std({ map: T.metal, color: 0x8d9290, roughness: 0.8 }),
    earth: std({ map: ctex(128, (g, S) => { g.fillStyle = '#7d6a4b'; g.fillRect(0, 0, S, S); dots(g, S, 1500, ['#6a5940', '#8f7b58', '#5c4d38', '#77754a', '#9b8863'], 4); }) }),
    canvas: std({ color: 0x777352, side: THREE.DoubleSide }),
    crater: new THREE.MeshStandardMaterial({
      map: ctex(128, (g, S) => { const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); r.addColorStop(0, 'rgba(28,22,16,.95)'); r.addColorStop(0.55, 'rgba(45,36,26,.8)'); r.addColorStop(1, 'rgba(70,56,40,0)'); g.fillStyle = r; g.fillRect(0, 0, S, S); }, false),
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1,
    }),
  });
}
const KINDS = new Set(['craft', 'deck', 'ramp', 'hedgehog', 'log', 'tank', 'turret', 'truck', 'cannon', 'earth', 'snag', 'wire', 'crater', 'canvas']);
export const isFrontKind = k => KINDS.has(k) || isWinterKind(k);

// Draws one box of the land. T: the client's textures.
export function drawFrontBox(g, b, w, h, d, x, z, T) {
  const m = materials(T), y0 = b.min[1], o = new THREE.Group(), long = d >= w;
  o.position.set(x, y0, z);
  const put = (geo, material, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0) => part(o, geo, material, px, py, pz, rx, ry, rz);
  let cast = true;
  switch (b.kind) {
    case 'turret': return;                 // part of the tank
    default: cast = drawWinterBox(o, b, w, h, d, T); break;
    case 'craft': put(uvBox(w, h, d, 3), m.craft, 0, h / 2, 0); if (Math.min(w, d) < 0.5) box(o, 0.5, 0.1, d, 0, h, 0, mat(STEEL)); break;
    case 'deck': put(uvBox(w, 0.06, d, 3), m.deck, 0, 0.1, 0); cast = false; break;
    case 'ramp': put(uvBox(w, 0.1, d + 0.2, 3), m.deck, 0, 0.16, 0, 0.1); break;
    case 'earth': {
      const geo = uvBox(w, h, d, 2.2), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { if (long) p.setX(i, p.getX(i) * 0.72); else p.setZ(i, p.getZ(i) * 0.72); }   // sloping sides
      geo.computeVertexNormals();
      put(geo, m.earth, 0, h / 2, 0);
      break;
    }
    case 'canvas': put(uvBox(w, 0.08, d, 2), m.canvas, 0, h / 2, 0); break;
    case 'hedgehog': {
      const iron = mat(RUST, 0.8, 0.4), beam = boxG(0.17, 2.1, 0.17);
      for (const [a, c] of [[0.2, 0], [2.3, 0.1], [4.4, -0.1]]) { const q = new THREE.Group(); q.position.y = 0.66; q.rotation.y = a + x; o.add(q); part(q, beam, iron, 0, 0, 0, 0.9, 0, c); }
      break;
    }
    case 'log': put(cylG(0.13, 0.17, 2.7, 8), mat(LOG), 0, 1.2, 0, Math.sin(x) * 0.12, 0, Math.cos(x * 3) * 0.12); box(o, 0.36, 0.16, 0.36, 0, 2.35, 0, mat(DARK)); break;
    case 'snag': {
      const wood = mat(0x2f2821);
      put(cylG(0.12, 0.3, h, 8), wood, 0, h / 2, 0);
      for (const [y, a, l] of [[h * 0.6, x, 1.4], [h * 0.75, x + 2.2, 1.1], [h * 0.88, x + 4.1, 0.8]]) limb(o, [0, y, 0], [Math.cos(a) * l, y + l * 0.6, Math.sin(a) * l], 0.07, wood);
      break;
    }
    case 'wire': {
      const q = new THREE.Group(), L = Math.max(w, d), iron = mat(0x3a3835, 0.7, 0.4), ring = new THREE.TorusGeometry(0.4, 0.014, 4, 12);
      if (!long) q.rotation.y = Math.PI / 2;
      o.add(q);
      for (let i = 0; i < L / 0.36; i++) part(q, ring, iron, Math.sin(i * 2.4) * 0.08, 0.4, i * 0.36 - L / 2, 0, Math.sin(i * 1.7) * 0.5, 0);
      for (let i = 0; i <= 2; i++) box(q, 0.07, 1.1, 0.07, 0, 0.5, (i - 1) * L / 2.2, mat(LOG));
      break;
    }
    case 'crater': {
      put(new THREE.CircleGeometry(w / 2 * 1.15, 22), m.crater, 0, 0.02, 0, -Math.PI / 2);
      const rim = put(new THREE.TorusGeometry(w / 2 * 0.78, w * 0.1, 5, 18), m.earth, 0, 0, 0, Math.PI / 2, 0, 0); rim.scale.z = 0.28;
      cast = false;
      break;
    }
    case 'tank': {
      const L = Math.max(w, d), q = new THREE.Group(), hull = mat(BURNT, 0.85, 0.2), dark = mat(DARK, 0.9, 0.1), olive = mat(OLIVE, 0.85, 0.15);
      if (!long) q.rotation.y = Math.PI / 2;
      o.add(q);
      for (const s of [-1, 1]) {
        box(q, 0.55, 0.95, L - 0.2, s * 1.3, 0.52, 0, dark, 0.2);
        for (let i = 0; i < 5; i++) part(q, cylG(0.36, 0.36, 0.1, 14), hull, s * 1.58, 0.42, (i - 2) * (L - 1.6) / 4.6, 0, 0, Math.PI / 2);
        box(q, 0.62, 0.06, L - 0.1, s * 1.3, 1.04, 0, olive);
      }
      box(q, 2.1, 0.85, L - 0.6, 0, 0.95, 0, hull, 0.06);
      box(q, 2.1, 0.1, 1.5, 0, 1.05, L / 2 - 0.5, olive, 0, 0.6);
      part(q, cylG(0.8, 1, 0.72, 16), hull, 0, 1.86, 0);
      box(q, 0.5, 0.4, 0.5, 0, 1.85, 0.85, olive, 0.06);
      part(q, cylG(0.075, 0.09, 3, 10), dark, 0, 1.72, 2.3, Math.PI / 2 + 0.07);
      part(q, cylG(0.32, 0.32, 0.1, 14), olive, 0.2, 2.26, -0.3, 0.5);   // hatch left open
      break;
    }
    case 'truck': {
      const L = Math.max(w, d), q = new THREE.Group(), body = mat(OLIVE, 0.85, 0.1), dark = mat(DARK), cloth = m.canvas;
      if (!long) q.rotation.y = Math.PI / 2;
      o.add(q);
      box(q, 2.3, 0.35, L, 0, 0.75, 0, body, 0.04); box(q, 1.7, 0.7, 1.5, 0, 1.25, L / 2 - 0.75, body, 0.1); box(q, 2.1, 1.25, 1.2, 0, 1.5, L / 2 - 2, body, 0.08);
      box(q, 1.8, 0.45, 0.04, 0, 1.75, L / 2 - 1.39, mat(0x27323a, 0.3)); box(q, 2.3, 0.5, 3.3, 0, 1.1, -L / 2 + 1.7, body, 0.03);
      const top = part(q, new THREE.CylinderGeometry(1.12, 1.12, 3.2, 14, 1, true, -Math.PI / 2, Math.PI), cloth, 0, 1.3, -L / 2 + 1.7, -Math.PI / 2, 0, 0); top.scale.z = 0.85;
      for (const s of [-1, 1]) for (const p of [L / 2 - 0.9, -L / 2 + 0.8, -L / 2 + 1.9]) part(q, cylG(0.45, 0.45, 0.3, 16), dark, s * 1.05, 0.45, p, 0, 0, Math.PI / 2);
      break;
    }
    case 'cannon': {
      const iron = mat(0x4a4f45, 0.6, 0.3), dark = mat(DARK);
      for (const s of [-1, 1]) { part(o, cylG(0.62, 0.62, 0.16, 18), dark, s * 0.85, 0.62, 0, 0, 0, Math.PI / 2); limb(o, [s * 0.3, 0.6, 0.2], [s * 0.95, 0.12, 2], 0.09, iron); }
      box(o, 1.6, 1, 0.07, 0, 0.95, -0.5, iron, 0, -0.2); part(o, cylG(0.1, 0.16, 3.6, 14), iron, 0, 1.35, -1.5, -Math.PI / 2 + 0.16 * -1); box(o, 0.4, 0.4, 1, 0, 1.05, 0.2, iron, 0.06);
      break;
    }
  }
  o.traverse(q => { if (q.isMesh) { q.castShadow = cast; q.receiveShadow = true; } });
  // shapes from the model kit are shared, and merging the land frees what it merges
  o.traverse(q => { if (q.isMesh && q.geometry.userData.shared) q.geometry = q.geometry.clone(); });
  g.add(o);
}

/* ---------------- the ground, the sea and what lies beyond ---------------- */
function height(x, z, hx, hz) {
  const d = Math.abs(x) - hx, inland = z - hz;
  let h = 0;
  if (d > 0) {
    const land = smooth(-hz - 6, -hz + 24, z);   // the cliffs end in the sea
    h = land * (smooth(0, 0.6, d) * (4.2 + bumps(x, z) * 0.9) + Math.min(d, 60) * 0.11 + bumps(x * 0.6, z * 0.6) * smooth(2, 20, d) * 2.2) - (1 - land) * Math.min(3, d * 0.2);
  }
  if (inland > 0) h = Math.max(h, smooth(0, 6, inland) * 1.4 + smooth(6, 70, inland) * (7 + bumps(x * 0.35, z * 0.35) * 5));
  if (z < -hz) h -= Math.min(6, (-hz - z) * 0.08);
  return h;
}
function terrain(map) {
  const [hx, hz] = map.size, F = map.theme.front, q = new THREE.Color();
  const C = { sand: 0xd3bd90, dry: 0xc2aa7c, wet: 0x85745a, mud: 0x75634a, grass: 0x6d7546, grass2: 0x848054, rock: 0xa99f8a, rock2: 0x7c735f, bed: 0x5f6252 };
  for (const k in C) C[k] = new THREE.Color(C[k]);
  return groundMesh(map, (x, z) => height(x, z, hx, hz), (c, x, z, n, n2) => {
    c.copy(C.sand).lerp(C.dry, n * 0.5 + 0.5);
    c.lerp(C.wet, 1 - smooth(F.sea, F.sea + 7, z + n * 1.5));
    c.lerp(C.bed, smooth(F.sea - 4, F.sea - 22, z));
    q.copy(C.mud).lerp(C.grass, smooth(-0.35, 0.5, n2 + smooth(8, 30, z) * 0.35)).lerp(C.grass2, (n * 0.5 + 0.5) * 0.5);
    c.lerp(q, smooth(F.sand - 3, F.sand + 4, z + n * 2));
    const d = Math.abs(x) - hx;
    if (d > 0 && z > -hz - 30) { q.copy(C.rock).lerp(C.rock2, n * 0.5 + 0.5).lerp(C.grass, smooth(1.2, 5, d)); c.lerp(q, smooth(0, 0.3, d) * smooth(-hz - 12, -hz + 12, z)); }
  });
}
function ship(size = 1) {
  const g = new THREE.Group(), hull = mat(0x4a525a, 0.9), up = mat(0x5c646b, 0.9), dark = mat(0x33383d, 0.9);
  box(g, 60, 7, 10, 0, 2, 0, hull); for (const s of [-1, 1]) part(g, cylG(0.5, 5, 14, 4), hull, s * 34, 2.6, 0, 0, Math.PI / 4, -s * Math.PI / 2).scale.set(1, 1, 0.75);
  box(g, 18, 5, 8, 2, 8, 0, up); box(g, 9, 6, 6, 5, 13, 0, up); box(g, 4, 4, 4, 6, 18, 0, up);
  part(g, cylG(1.8, 2, 8, 12), dark, -6, 13, 0); part(g, cylG(1.6, 1.8, 7, 12), dark, -12, 11, 0);
  part(g, cylG(0.25, 0.4, 16, 6), dark, 6, 26, 0); box(g, 5, 0.3, 0.3, 6, 29, 0, dark);
  for (const [x, y, s] of [[20, 6, 1], [13, 8, 1], [-20, 6, -1]]) { box(g, 5, 2.6, 5, x, y + 1, 0, up, 0.4); for (const z of [-1.2, 1.2]) part(g, cylG(0.3, 0.4, 9, 8), dark, x + s * 5, y + 1.8, z, 0, 0, -s * (Math.PI / 2 - 0.2)); }
  g.scale.setScalar(size);
  return bake(g, false);
}
function boat() {
  const g = new THREE.Group(), hull = mat(0x737d83, 0.9), dark = mat(0x32373a);
  box(g, 0.4, 1.8, 9, -2, 0.5, 0, hull); box(g, 0.4, 1.8, 9, 2, 0.5, 0, hull); box(g, 4.4, 2.4, 1.4, 0, 0.9, -4.6, hull); box(g, 4, 2, 0.2, 0, 0.8, 4.5, hull, 0, -0.2); box(g, 4, 0.2, 9, 0, 0, 0, dark);
  for (let i = 0; i < 10; i++) part(g, ballG(0.26, 1, 8), mat(OLIVE), (i % 2 ? 0.7 : -0.7) + Math.sin(i * 5) * 0.2, 1.2, (i >> 1) * 1.4 - 2.6);
  return bake(g, false);
}
function balloon() {
  const g = new THREE.Group(), skin = mat(0xb9c0bf, 0.7);
  part(g, ballG(1, 1, 18), skin).scale.set(2.2, 2.2, 5);
  for (const a of [0.5, Math.PI - 0.5, -Math.PI / 2]) box(g, 3, 0.35, 2.6, Math.cos(a) * 1.8, Math.sin(a) * 1.8, -4.4, skin, 0.15, 0, 0, a);
  part(g, cylG(0.03, 0.03, 60, 4), mat(DARK), 0, -31, 0);
  return bake(g, false);
}
const SHIPS = [[-150, -205, 0.15, 1], [-35, -255, -0.1, 1.2], [75, -215, 0.1, 0.9], [185, -250, -0.2, 1.1], [-270, -260, 0.1, 1]];

export function buildFront(map) {
  if (map.theme.front.river) return buildWinter(map);
  const g = new THREE.Group(), F = map.theme.front, [hx, hz] = map.size;
  g.add(terrain(map));
  const waves = ctex(256, (c, S) => {
    c.fillStyle = '#b9c6c6'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { c.strokeStyle = Math.random() < 0.4 ? 'rgba(255,255,255,.35)' : 'rgba(70,95,100,.35)'; c.lineWidth = rnd(1, 3); const x = Math.random() * S, y = Math.random() * S, l = rnd(14, 50); for (const o of [0, -S, S]) { c.beginPath(); c.moveTo(x + o, y); c.quadraticCurveTo(x + o + l / 2, y + rnd(-5, 5), x + o + l, y); c.stroke(); } }
  });
  waves.repeat.set(70, 33);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 420), new THREE.MeshStandardMaterial({ map: waves, color: 0x6f8b8c, roughness: 0.28, metalness: 0.1, transparent: true, opacity: 0.8, depthWrite: false }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.11, F.sea - 210); water.receiveShadow = true; water.renderOrder = 1; g.add(water);
  const foamTex = ctex(256, (c, S) => {
    c.clearRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { const y = S * (0.5 + (Math.random() - 0.5) * Math.random()), e = 1 - Math.abs(y / S - 0.5) * 2; c.fillStyle = `rgba(255,255,255,${0.55 * e * Math.random()})`; c.beginPath(); c.ellipse(Math.random() * S, y, rnd(3, 14), rnd(1, 4), 0, 0, 7); c.fill(); }
  });
  foamTex.wrapT = THREE.ClampToEdgeWrapping;
  const foams = [0, 1, 2, 3].map(i => {
    const t = foamTex.clone(); t.repeat.set(10, 1); t.offset.x = i * 0.37;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2 + 6, 5), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.8, depthWrite: false, color: 0xe9e6dd }));
    f.rotation.x = -Math.PI / 2; f.position.y = 0.13 + i * 0.004; f.renderOrder = 2; g.add(f);
    return f;
  });
  for (const [x, z, r, s] of SHIPS) { const m = ship(s); m.position.set(x, -0.6, z); m.rotation.y = r; g.add(m); }
  const boats = [], b0 = boat();
  for (let i = 0; i < 7; i++) { const b = b0.clone(); b.userData.k = i / 7; b.userData.x = -78 + i * 26 + rnd(-5, 5); g.add(b); boats.push(b); }
  const balloons = [], l0 = balloon();
  for (const [x, y, z] of [[-62, 52, -20], [66, 60, 6], [-58, 64, 48], [58, 50, 60], [10, 70, 92]]) { const b = l0.clone(); b.position.set(x, y, z); g.add(b); balloons.push(b); }
  // ruined skyline and bare trees behind the land
  const back = new THREE.Group(), wall = mat(0x857c6b), roof = mat(0x5a4c42), bark = mat(0x2f2821);
  for (let i = 0; i < 16; i++) {
    const x = -130 + i * 17 + rnd(-5, 5), z = rnd(74, 130), y = height(x, z, hx, hz), w = rnd(6, 11), h = rnd(3.5, 8);
    box(back, w, h, rnd(6, 9), x, y + h / 2 - 0.5, z, wall, 0, 0, rnd(-0.4, 0.4)); if (i % 3) part(back, cylG(0.4, w * 0.62, 3.2, 4), roof, x, y + h + 1, z, 0, Math.PI / 4); else box(back, w * 0.4, rnd(2, 4), 5, x + w * 0.3, y + h + 1, z, wall);
  }
  for (let i = 0; i < 70; i++) {
    const side = i % 3, x = side ? (side === 1 ? -1 : 1) * rnd(50, 120) : rnd(-60, 60), z = side ? rnd(-12, 90) : rnd(60, 100), y = height(x, z, hx, hz), h = rnd(4, 8);
    part(back, cylG(0.1, 0.28, h, 6), bark, x, y + h / 2, z, rnd(-0.1, 0.1), 0, rnd(-0.1, 0.1));
    for (let k = 0; k < 3; k++) { const a = rnd(0, 6.283), l = rnd(1, 2.2); limb(back, [x, y + h * (0.5 + k * 0.16), z], [x + Math.cos(a) * l, y + h * (0.5 + k * 0.16) + l, z + Math.sin(a) * l], 0.06, bark); }
  }
  g.add(bake(back, false));
  g.userData.update = (dt, t) => {
    waves.offset.set(t * 0.006, -t * 0.012);
    foams.forEach((f, i) => { const k = (t * 0.09 + i / 4) % 1; f.position.z = F.sea - 13 + k * 15 - smooth(0.75, 1, k) * 2.5; f.material.opacity = 0.85 * smooth(0, 0.3, k) * (1 - smooth(0.7, 1, k)); f.position.x = Math.sin(t * 0.2 + i * 2) * 1.5; });
    for (const b of boats) { const k = (t * 0.012 + b.userData.k) % 1; b.position.set(b.userData.x, -0.5 + Math.sin(t * 1.3 + b.userData.x) * 0.16 - smooth(0.93, 1, k) * 3 - (1 - smooth(0, 0.05, k)) * 3, -215 + k * 135); b.rotation.set(Math.sin(t * 1.1 + b.userData.x) * 0.05, 0, Math.sin(t * 0.8 + b.userData.x * 2) * 0.04); }
    balloons.forEach((b, i) => { b.rotation.set(Math.sin(t * 0.3 + i) * 0.04, 0.4 + Math.sin(t * 0.13 + i * 2) * 0.35, 0); });
  };
  return g;
}

/* ---------------- planes and helicopters ---------------- */
const TEAM = { red: 0xc23b2a, blue: 0x2f6fd0 }, spinMat = new THREE.MeshBasicMaterial({ color: 0x22241f, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
// Nose toward +x.
function planeModel(team) {
  const g = new THREE.Group(), skin = mat(0x787d63, 0.75, 0.1), belly = mat(0x9aa0a0, 0.8), dark = mat(0x24251f, 0.6), glass = mat(0x2c3a44, 0.2, 0.3), mark = mat(TEAM[team], 0.8);
  part(g, cylG(1.15, 1.15, 9, 16), skin, 0.5, 0, 0, 0, 0, Math.PI / 2); part(g, cylG(0.4, 1.15, 6.5, 16), skin, -7.2, 0.2, 0, 0, 0, Math.PI / 2 - 0.03); part(g, ballG(1.15, 1, 16), glass, 5, 0, 0).scale.set(1.5, 1, 1);
  box(g, 2.4, 0.8, 1.1, 2.6, 1.1, 0, glass, 0.3); box(g, 8, 0.4, 1.4, 0.4, -1, 0, belly, 0.2);
  for (const s of [-1, 1]) {
    box(g, 3.2, 0.34, 11, 0.6, 0.05, s * 6, skin, 0.15, s * -0.04); box(g, 2, 0.22, 4.4, 0.3, 0.3, s * 12, skin, 0.1, s * -0.06);
    part(g, cylG(0.72, 0.6, 4.2, 14), skin, 1.8, 0.05, s * 4.2, 0, 0, -Math.PI / 2); part(g, cylG(0.6, 0.68, 0.5, 14), dark, 4, 0.05, s * 4.2, 0, 0, Math.PI / 2);
    const disc = part(g, cylG(1.75, 1.75, 0.02, 24), spinMat, 4.4, 0.05, s * 4.2, 0, 0, Math.PI / 2); disc.userData.keep = true;
    box(g, 1.8, 0.2, 3, -9.6, 0.6, s * 1.9, skin, 0.08); box(g, 2, 2.4, 0.22, -9.8, 1, s * 3.3, skin, 0.08);
    box(g, 2, 0.36, 1.5, 0.5, 0.2, s * 10, mark, 0.1);
  }
  box(g, 1.1, 1.9, 1.9, -4.2, 0.15, 0, mark, 0.5);
  return bake(g, false);
}
// Nose toward +x.
function heliModel(team) {
  const g = new THREE.Group(), skin = mat(0x6d7355, 0.8, 0.05), dark = mat(0x24251f, 0.6, 0.2), glass = mat(0x2d3d48, 0.15, 0.3), mark = mat(TEAM[team], 0.8), tube = mat(0x3b3f31, 0.7, 0.2);
  box(g, 3.2, 1.7, 1.7, -0.2, 0, 0, skin, 0.35); part(g, ballG(1, 1, 18), glass, 1.6, -0.05, 0).scale.set(1.05, 0.95, 0.88); box(g, 0.1, 1.5, 1.4, 1.35, 0, 0, dark);
  box(g, 1.4, 0.7, 1.1, -0.5, 1, 0, dark, 0.15); part(g, cylG(0.09, 0.12, 0.9, 10), dark, -0.3, 1.6, 0);
  // open tail of steel tubes
  for (const [y, z] of [[0.45, 0.35], [0.45, -0.35], [-0.35, 0]]) limb(g, [-1.6, y, z], [-6.4, 0.55, z * 0.25], 0.05, tube);
  for (let i = 0; i < 5; i++) { const x = -2.2 - i * 0.85, k = 1 - i * 0.17; limb(g, [x, 0.45, 0.33 * k], [x - 0.4, -0.3 * k + 0.1, 0], 0.03, tube); limb(g, [x, 0.45, -0.33 * k], [x - 0.4, -0.3 * k + 0.1, 0], 0.03, tube); }
  box(g, 0.9, 1.3, 0.1, -6.5, 0.9, 0, mark, 0.04); box(g, 0.7, 0.08, 1.7, -6, 0.5, 0, skin, 0.03);
  for (const s of [-1, 1]) { limb(g, [-1.3, -1.35, s * 0.95], [1.5, -1.35, s * 0.95], 0.06, dark); for (const x of [-0.8, 0.8]) limb(g, [x, -0.7, s * 0.6], [x, -1.35, s * 0.95], 0.05, dark); box(g, 1, 0.5, 0.05, -0.6, 0.05, s * 0.87, mark, 0.02); }
  box(g, 0.5, 0.3, 0.3, 1, -1, 0, dark, 0.05); part(g, cylG(0.05, 0.05, 1.3, 8), dark, 1.7, -1.05, 0, 0, 0, Math.PI / 2);
  const rotor = new THREE.Group(), tail = new THREE.Group();
  rotor.userData.keep = tail.userData.keep = true; rotor.position.set(-0.3, 2.05, 0); tail.position.set(-6.6, 1.2, 0.2);
  for (const a of [0, Math.PI / 2]) { const b = part(rotor, boxG(9.6, 0.05, 0.3), dark); b.rotation.y = a; const c = part(tail, boxG(1.5, 0.12, 0.04), dark); c.rotation.z = a; }
  part(rotor, cylG(4.8, 4.8, 0.02, 32), spinMat); part(rotor, cylG(0.2, 0.2, 0.2, 10), dark);
  g.add(rotor, tail);
  bake(g, false);
  rotor.name = 'rotor'; tail.name = 'tail';
  return g;
}
function bombModel() {
  const g = new THREE.Group(), m = mat(0x3c4034, 0.7, 0.2);
  part(g, cylG(0.26, 0.26, 1.1, 12), m); part(g, ballG(0.26, 1, 12), m, 0, -0.55, 0).scale.y = 1.4; part(g, cylG(0.26, 0.08, 0.6, 12), m, 0, 0.8, 0);
  for (const a of [0, Math.PI / 2]) box(g, 0.7, 0.45, 0.03, 0, 1, 0, m, 0, 0, a);
  return bake(g, false);
}

/* ---------------- smoke, fire, dirt and water: one draw call ---------------- */
function createParticles(max) {
  const tex = ctex(128, (g, S) => {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.283, d = Math.random() * S * 0.24, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, r = rnd(S * 0.1, S * 0.25), q = g.createRadialGradient(x, y, 0, x, y, r);
      q.addColorStop(0, 'rgba(255,255,255,.34)'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(0, 0, S, S);
    }
  }, false);
  const geo = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const at = (name, n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  const P = at('iPos', 3), C = at('iCol', 4), S = at('iSize', 2);
  geo.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, fogC: { value: new THREE.Color() }, fogR: { value: new THREE.Vector2(70, 420) } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSize; varying vec2 vUv; varying vec4 vCol; varying float vD; void main(){ vec4 p = viewMatrix * vec4(iPos, 1.0); float c = cos(iSize.y), s = sin(iSize.y); p.xy += vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSize.x; vUv = uv; vCol = iCol; vD = -p.z; gl_Position = projectionMatrix * p; }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 fogC; uniform vec2 fogR; varying vec2 vUv; varying vec4 vCol; varying float vD; void main(){ float a = texture2D(map, vUv).a * vCol.a * smoothstep(0.2, 1.6, vD); if (a < 0.004) discard; gl_FragColor = vec4(mix(vCol.rgb, fogC, smoothstep(fogR.x, fogR.y, vD)), a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false; mesh.renderOrder = 4;
  const list = [], col = new THREE.Color();
  return {
    mesh,
    add(x, y, z, o) {   // o: { v: [x, y, z], life, s0, s1, c, a, g: gravity, drag, hot: glows this much }
      if (list.length >= max) list.shift();
      col.set(o.c);
      const k = o.hot || 1;
      list.push({ x, y, z, vx: o.v?.[0] || 0, vy: o.v?.[1] || 0, vz: o.v?.[2] || 0, t: 0, life: o.life, s0: o.s0, s1: o.s1 ?? o.s0, r: col.r * k, g: col.g * k, b: col.b * k, a: o.a ?? 0.8, gr: o.g || 0, drag: o.drag || 0, rot: rnd(0, 6.283), w: rnd(-0.4, 0.4) });
    },
    clear() { list.length = 0; geo.instanceCount = 0; },
    count: () => list.length,
    update(dt, fog) {
      material.uniforms.fogC.value.copy(fog.color); material.uniforms.fogR.value.set(fog.near, fog.far);
      let n = 0;
      for (const p of list) {
        if ((p.t += dt) >= p.life) continue;
        p.vy -= p.gr * dt;
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.w * dt;
        if (p.gr && p.y < 0.05) { p.y = 0.05; p.vx = p.vz = p.vy = 0; }
        list[n++] = p;
      }
      list.length = n;
      for (let i = 0; i < n; i++) {
        const p = list[i], k = p.t / p.life;
        P.setXYZ(i, p.x, p.y, p.z); C.setXYZW(i, p.r, p.g, p.b, p.a * Math.min(1, k * 8) * (1 - k) ** 0.8); S.setXY(i, p.s0 + (p.s1 - p.s0) * (1 - (1 - k) ** 2), p.rot);
      }
      geo.instanceCount = n;
      for (const a of [P, C, S]) { a.clearUpdateRanges?.(); a.needsUpdate = true; }
    },
  };
}

/* ---------------- the war ---------------- */
// audio(): { AC, master, noise } once the sound device is open. tracer(a, b), shot(dist, pan), boom(dist, pan): the client's own effects.
export function createWar({ scene, audio, tracer, shot, boom, shake }) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  let map = null, F = null, parts = null, protos = null, scorch = null, scorchN = 0, squad = [], team = 'red', ear = new THREE.Vector3(), earYaw = 0;
  const flights = new Map(), A = new THREE.Vector3(), B = new THREE.Vector3(), O = new THREE.Object3D();
  let nextFlak = 0, nextSea = 0, nextGun = 0, nextInland = 0;
  const later = [], burn = new Map();
  const atSea = (z, y) => F.sea != null && z < F.sea - 1 && y < 0.5, onIce = (z, y) => F.river && z > F.river[0] && z < F.river[1] && y < 0.5;

  function prepare() {
    if (protos) return;
    parts = createParticles(1100); root.add(parts.mesh);
    protos = { plane: { red: planeModel('red'), blue: planeModel('blue') }, heli: { red: heliModel('red'), blue: heliModel('blue') }, bomb: bombModel() };
    const store = new THREE.Group(); store.visible = false;   // kept in the scene, so their shaders are built with the rest
    store.add(protos.plane.red, protos.plane.blue, protos.heli.red, protos.heli.blue, protos.bomb); root.add(store);
    for (let i = 0; i < 9; i++) {           // a formation that only passes by, high up
      const p = protos.plane.red.clone(); p.scale.setScalar(0.9); p.rotation.y = -Math.PI / 2; root.add(p);
      squad.push([p, (Math.abs(i - 4)) * 17, (i - 4) * 21]);
    }
    scorch = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ map: M.crater.map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), 36);
    scorch.count = 0; scorch.frustumCulled = false; scorch.renderOrder = 3; root.add(scorch);
  }

  /* ---- sound ---- */
  function engine(kind) {
    const a = audio();
    if (!a || a.AC.state !== 'running') return null;
    const { AC, master, noise } = a, out = AC.createGain(), pan = AC.createStereoPanner(), lp = AC.createBiquadFilter(), nodes = [];
    out.gain.value = 0; lp.type = 'lowpass'; lp.frequency.value = 900;
    lp.connect(out).connect(pan).connect(master);
    if (kind === 'bomb') for (const f of [71, 74.5, 112]) { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sawtooth'; o.frequency.value = f; g.gain.value = 0.3; o.connect(g).connect(lp); o.start(); nodes.push(o); }
    else {
      const s = AC.createBufferSource(), chop = AC.createGain(), lfo = AC.createOscillator(), deep = AC.createGain(), o = AC.createOscillator(), og = AC.createGain();
      s.buffer = noise; s.loop = true; chop.gain.value = 0.35; lfo.type = 'sawtooth'; lfo.frequency.value = 12.5; deep.gain.value = 0.45;
      lfo.connect(deep).connect(chop.gain); s.connect(chop).connect(lp); o.type = 'sawtooth'; o.frequency.value = 54; og.gain.value = 0.22; o.connect(og).connect(lp);
      s.start(); lfo.start(); o.start(); nodes.push(s, lfo, o);
    }
    let last = 0;
    return {
      set(dist, p, rate) { const t = AC.currentTime; if (t - last < 0.06) return; last = t; out.gain.setTargetAtTime((kind === 'bomb' ? 0.34 : 0.3) / (1 + (dist / 45) ** 2), t, 0.08); pan.pan.setTargetAtTime(clamp(p, -0.8, 0.8), t, 0.08); lp.frequency.setTargetAtTime(Math.max(220, 1300 - dist * 5), t, 0.1); for (const n of nodes) n.detune?.setTargetAtTime(rate, t, 0.1); },
      stop() { const t = AC.currentTime; out.gain.setTargetAtTime(0, t, 0.15); for (const n of nodes) n.stop(t + 0.8); },
    };
  }
  function whistle(dist, pan, left) {
    const a = audio();
    if (!a || a.AC.state !== 'running' || dist > 70) return;
    const { AC, master } = a, t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(), p = AC.createStereoPanner();
    o.type = 'sine'; o.frequency.setValueAtTime(1750, t); o.frequency.exponentialRampToValueAtTime(520, t + left);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.075 / (1 + dist * 0.045), t + left * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + left);
    p.pan.value = clamp(pan, -0.8, 0.8); o.connect(g).connect(p).connect(master); o.start(t); o.stop(t + left + 0.02);
  }
  const panTo = (x, z) => { const a = Math.atan2(-(x - ear.x), -(z - ear.z)) - earYaw; return -Math.sin(a); };
  const far = (x, z) => Math.hypot(x - ear.x, z - ear.z);

  /* ---- effects ---- */
  function splash(x, z, s = 1) {
    for (let i = 0; i < 12; i++) parts.add(x + rnd(-0.6, 0.6) * s, 0.2, z + rnd(-0.6, 0.6) * s, { v: [rnd(-2, 2) * s, rnd(6, 15) * Math.sqrt(s), rnd(-2, 2) * s], g: 11, life: rnd(0.9, 1.7), s0: 1.2 * s, s1: 4.2 * s, c: 0xdfe6e4, a: 0.45 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; parts.add(x, 0.3, z, { v: [Math.cos(a) * 5 * s, 0.6, Math.sin(a) * 5 * s], drag: 1.6, life: 1.4, s0: 1 * s, s1: 3 * s, c: 0xe9eeec, a: 0.5 }); }
  }
  function explosion(x, y, z, s = 1) {
    const [dark, pale] = F.dirt || [0x3a332a, 0x5a4d3c], dust = F.dust || 0xa08c69;
    for (let i = 0; i < 9; i++) parts.add(x + rnd(-1, 1) * s, y + rnd(0.2, 1.4) * s, z + rnd(-1, 1) * s, { v: [rnd(-3, 3), rnd(1, 5), rnd(-3, 3)], drag: 2, life: rnd(0.45, 0.95), s0: 1.6 * s, s1: rnd(3, 4.8) * s, c: i % 3 ? 0xff8a20 : 0xffd080, a: 1, hot: 2 });
    for (let i = 0; i < 12; i++) parts.add(x + rnd(-1.4, 1.4) * s, y + rnd(0.3, 2) * s, z + rnd(-1.4, 1.4) * s, { v: [rnd(-2, 2) * s, rnd(1.5, 5.5) * s, rnd(-2, 2) * s], drag: 1.1, life: rnd(1.6, 3.4), s0: 1.6 * s, s1: rnd(4.5, 7) * s, c: i % 2 ? dark : pale, a: 0.75 });
    for (let i = 0; i < 18; i++) parts.add(x, y + 0.3, z, { v: [rnd(-7, 7) * s, rnd(5, 15) * Math.sqrt(s), rnd(-7, 7) * s], g: 15, life: rnd(1, 1.9), s0: rnd(0.25, 0.7) * s, c: F.dirt && i % 2 ? pale : 0x3d2f20, a: 1 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; parts.add(x, y + 0.4, z, { v: [Math.cos(a) * 9 * s, 0.5, Math.sin(a) * 9 * s], drag: 2.2, life: rnd(1.2, 2.2), s0: 1.4 * s, s1: 4 * s, c: dust, a: 0.5 }); }
  }
  function mark(x, y, z, r) {
    O.position.set(x, y + 0.035, z); O.rotation.set(-Math.PI / 2, 0, rnd(0, 6)); O.scale.set(r, r, 1); O.updateMatrix();
    scorch.setMatrixAt(scorchN % 36, O.matrix); scorch.instanceMatrix.needsUpdate = true; scorch.count = Math.min(36, ++scorchN);
  }
  function blast([x, y, z]) {
    if (!map) return;
    const d = far(x, z);
    if (atSea(z, y)) splash(x, z, 1.5); else { explosion(x, y, z, 1.8); mark(x, y, z, 3.2); if (onIce(z, y)) splash(x, z, 1.1); }   // water comes up through the ice
    boom(d, panTo(x, z)); if (d < 34) shake(0.085 * (1 - d / 34));
  }

  /* ---- flights ---- */
  function end(id) { const f = flights.get(id); if (!f) return; for (const o of f.objs) root.remove(o); for (const o of f.bombs) if (o) root.remove(o); f.snd?.stop(); flights.delete(id); }
  function flight(m) {
    if (!map) return '';
    const f = { ...m, t0: nowS() - m.a, objs: [], bombs: [], whistled: new Set(), fireAt: null, fired: 0, yaw: m.dir > 0 ? 0 : Math.PI, snd: null, crashed: false };
    const add = o => { const c = o.clone(); root.add(c); return c; };
    if (m.k === 'bomb') { f.objs = [0, 1, 2].map(() => add(protos.plane[m.tm])); f.bombs = m.b.map(() => { const c = add(protos.bomb); c.visible = false; return c; }); }
    else f.objs = [add(protos.heli[m.tm])];
    flights.set(m.id, f);
    const ours = m.tm === team;
    if (m.down != null || m.a > 3) return '';
    return m.k === 'bomb' ? (ours ? 'Our bombers are coming in' : 'Enemy bombers! Get away from the open') : ours ? 'Our helicopter is here' : 'Enemy helicopter! Take cover or shoot it down';
  }
  function updateFlight(f, dt, t) {
    const at = t - f.t0;
    if (at > flightLife(f) + 0.2) {
      if (f.k === 'heli' && f.down != null && !f.crashed) { f.crashed = true; const [x, , z] = heliAt(f, at); blast([x, 0, z]); explosion(x, 1, z, 1.4); }
      end(f.id);
      return;
    }
    f.snd ||= engine(f.k);
    if (f.k === 'bomb') {
      f.objs.forEach((o, i) => { o.position.set(...planeAt(f, at, i)); o.position.y += Math.sin(t * 1.7 + i * 2) * 0.35; o.rotation.set(Math.sin(t * 1.1 + i) * 0.04, f.dir > 0 ? 0 : Math.PI, 0); });
      f.b.forEach((b, i) => {
        const o = f.bombs[i], on = at > b[4] && at < bombLands(b);
        if (!o) return;
        o.visible = on;
        if (!on) return;
        const p = bombAt(f, b, at), q = bombAt(f, b, at + 0.05);
        o.position.set(...p); A.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]).normalize(); o.quaternion.setFromUnitVectors(B.set(0, 1, 0), A);
        const k = bombLands(b) - at;
        if (!f.whistled.has(i) && k < 1.9) { f.whistled.add(i); if (i % 2 === 0) whistle(far(b[0], b[2]), panTo(b[0], b[2]), k); }
      });
      const p = f.objs[0].position, d = p.distanceTo(ear);
      f.snd?.set(d, panTo(p.x, p.z), clamp((ear.x - p.x) * f.dir, -80, 80) * 2);
      return;
    }
    const o = f.objs[0], p = heliAt(f, at), q = heliAt(f, at + 0.1), vx = (q[0] - p[0]) * 10, vz = (q[2] - p[2]) * 10;
    o.position.set(...p);
    const aim = f.fireAt && t - f.fired < 2.5 && f.down == null ? Math.atan2(-(f.fireAt[2] - p[2]), f.fireAt[0] - p[0]) : Math.hypot(vx, vz) > 1 ? Math.atan2(-vz, vx) : f.yaw;
    if (f.down != null && at > f.down) {
      f.yaw += dt * 6; o.rotation.set(Math.sin(t * 5) * 0.3, f.yaw, 0.35, 'YXZ');
      for (let i = 0; i < 2; i++) parts.add(p[0], p[1] + 0.8, p[2], { v: [rnd(-1, 1), rnd(1, 3), rnd(-1, 1)], life: rnd(1.5, 2.6), s0: 1, s1: 4, c: i ? 0x1c1a18 : 0x2c2824, a: 0.8 });
      parts.add(p[0], p[1] + 0.4, p[2], { life: 0.3, s0: 1.4, s1: 0.6, c: 0xff8a2a, a: 1, hot: 2 });
    } else {
      f.yaw += Math.atan2(Math.sin(aim - f.yaw), Math.cos(aim - f.yaw)) * Math.min(1, dt * 2.6);
      const fw = vx * Math.cos(f.yaw) - vz * Math.sin(f.yaw);
      o.rotation.set(0, f.yaw, -clamp(fw * 0.012, -0.3, 0.3), 'YXZ');
    }
    const r = o.getObjectByName('rotor'), tl = o.getObjectByName('tail');
    if (r) r.rotation.y += dt * 24; if (tl) tl.rotation.z += dt * 40;
    if (p[1] < 24 && Math.random() < dt * 8 && f.down == null && Math.abs(p[0]) < 50) { const a = rnd(0, 6.283), wet = atSea(p[2] - 1, 0); parts.add(p[0] + Math.cos(a) * 5, 0.4, p[2] + Math.sin(a) * 5, { v: [Math.cos(a) * 5, 0.8, Math.sin(a) * 5], drag: 1.2, life: 1.6, s0: 1.2, s1: 4, c: wet ? 0xdde5e4 : F.dust || 0xb39d76, a: 0.35 }); }
    f.snd?.set(o.position.distanceTo(ear), panTo(p[0], p[2]), f.down != null ? -700 * Math.min(1, at - f.down) : 0);
  }
  function round(m) {
    const f = flights.get(m.id);
    if (!f || !map) return;
    const p = heliAt(f, nowS() - f.t0), [x, y, z] = m.e;
    f.fireAt = m.e; f.fired = nowS();
    A.set(p[0] + Math.cos(f.yaw) * 2.3, p[1] - 1.05, p[2] - Math.sin(f.yaw) * 2.3); B.set(x, y, z);
    tracer(A, B);
    parts.add(A.x, A.y, A.z, { life: 0.07, s0: 1.3, c: 0xffd070, a: 1, hot: 2.5 });
    if (atSea(z, y)) parts.add(x, 0.2, z, { v: [0, 4, 0], g: 9, life: 0.8, s0: 0.4, s1: 1.2, c: 0xe2e9e7, a: 0.8 });
    else for (let i = 0; i < 2; i++) parts.add(x, y + 0.1, z, { v: [rnd(-0.8, 0.8), rnd(1, 3.2), rnd(-0.8, 0.8)], drag: 1.5, life: rnd(0.5, 0.9), s0: 0.3, s1: 1.5, c: m.hit ? 0x7a2a1c : F.dust || 0x9c8762, a: 0.7 });
    shot(far(p[0], p[2]) * 0.7, panTo(p[0], p[2]));
    if (far(x, z) < 5) shot(far(x, z) + 14, panTo(x, z));
  }
  function down(m) { const f = flights.get(m.id); if (f) { f.down = m.down; const p = heliAt(f, m.down); explosion(p[0], p[1], p[2], 0.8); boom(far(p[0], p[2]) * 1.5, panTo(p[0], p[2])); } }

  /* ---- the war around the land ---- */
  function ambient(dt, t) {
    for (let i = later.length - 1; i >= 0; i--) if (later[i][0] <= t) later.splice(i, 1)[0][1]();
    for (const f of F.fires) {
      const [x, y, z, s] = f, d = far(x, z), st = burn.get(f) || { a: rnd(0, 0.3), b: 0 };
      burn.set(f, st);
      if ((st.a -= dt) <= 0) { st.a = (s > 2 ? 0.34 : 0.22) * (d > 60 ? 1.3 : 1); parts.add(x + rnd(-0.4, 0.4) * s, y + 0.4, z + rnd(-0.4, 0.4) * s, { v: [rnd(0.5, 1.2) * s, rnd(1.8, 2.8) * Math.sqrt(s), rnd(-0.2, 0.5) * s], life: rnd(5, 7), s0: 1.1 * s, s1: rnd(4.5, 6.5) * s, c: Math.random() < 0.5 ? 0x201d1a : 0x35302a, a: 0.62 }); }
      if (s < 2 && d < 70 && (st.b -= dt) <= 0) { st.b = 0.07; parts.add(x + rnd(-0.5, 0.5) * s, y - rnd(0, 0.5), z + rnd(-0.5, 0.5) * s, { v: [rnd(-0.2, 0.4), rnd(1.2, 2.4), rnd(-0.2, 0.2)], life: rnd(0.4, 0.8), s0: rnd(0.7, 1.1) * s, s1: 0.2, c: Math.random() < 0.3 ? 0xffc050 : 0xff6a1a, a: 0.9, hot: 1.8 }); }
    }
    if (t > nextFlak) {
      nextFlak = t + rnd(0.15, 0.9);
      const a = rnd(0, 6.283), r = rnd(50, 200), x = Math.cos(a) * r, y = rnd(58, 120), z = Math.sin(a) * r * 0.8;
      parts.add(x, y, z, { life: 0.16, s0: 3, s1: 6, c: 0xffc060, a: 1, hot: 3 });
      for (let i = 0; i < 3; i++) parts.add(x + rnd(-1, 1), y + rnd(-1, 1), z + rnd(-1, 1), { v: [0.8, -0.2, 0], life: rnd(3.5, 6), s0: 2.2, s1: rnd(6, 9), c: 0x2b2a29, a: 0.6 });
    }
    if (F.sea != null && t > nextSea) { nextSea = t + rnd(1.2, 3.6); splash(rnd(-110, 110), rnd(-150, -62), rnd(1, 2)); }
    if (F.sea != null && t > nextGun) {
      nextGun = t + rnd(2.5, 6);
      const [x, z] = SHIPS[Math.random() * 4 | 0];
      for (const o of [10, 22]) { parts.add(x + o, 11, z + 4, { v: [4, 1, 5], life: 0.22, s0: 8, s1: 16, c: 0xffd27a, a: 1, hot: 3 }); parts.add(x + o, 11, z + 6, { v: [2, 1.5, 4], life: 4.5, s0: 8, s1: 24, c: 0x8a8378, a: 0.55 }); }
    }
    if (t > nextInland) {
      nextInland = t + rnd(3, 7);
      const s = Math.random() < 0.5 ? -1 : 1, beside = Math.random() < 0.5, x = beside ? s * rnd(62, 120) : rnd(-90, 90), z = beside ? rnd(-5, 90) : rnd(80, 130);
      explosion(x, F.river ? winterHeight(x, z, ...map.size) : height(x, z, ...map.size), z, 2); const d = far(x, z); later.push([t + d / 340, () => boom(d * 1.6, panTo(x, z))]);
    }
    const k = (t * 34) % 1100 - 550;
    for (const [p, back, side] of squad) { p.position.set(side + 15, 112 + Math.sin(t * 0.7 + side) * 0.8, k - back); p.visible = Math.abs(k) < 480; }
  }

  return {
    // Called when a land is shown. Only fronts have a war.
    load(next, T) {
      this.clear();
      map = next.theme.front ? next : null; F = map?.theme.front;
      root.visible = !!map;
      if (!map) return;
      materials(T); prepare();
      parts.clear(); scorch.count = scorchN = 0; nextFlak = nextSea = nextGun = nextInland = 0; later.length = 0;
    },
    flight, round, down, blast,
    clear() { for (const id of [...flights.keys()]) end(id); if (scorch) scorch.count = scorchN = 0; },
    // Where enemy bombs are about to fall: [x, z, seconds left]
    *bombs() { const t = nowS(); for (const f of flights.values()) if (f.k === 'bomb' && f.tm !== team) for (const b of f.b) { const k = bombLands(b) - (t - f.t0); if (k > 0) yield [b[0], b[2], k]; } },
    helis() { return [...flights.values()].filter(f => f.k === 'heli' && f.down == null).map(f => { const p = heliAt(f, nowS() - f.t0); return [p[0], p[2], f.tm]; }); },
    stats: () => ({ flights: flights.size, particles: parts?.count() || 0 }),
    update(dt, s) {
      if (!map) return;
      const t = nowS();
      ear.copy(s.cam.position); earYaw = s.yaw; team = s.team;
      for (const f of [...flights.values()]) updateFlight(f, dt, t);
      ambient(dt, t);
      parts.update(dt, scene.fog);
      s.world?.userData.front?.userData.update(dt, t);
    },
  };
}
export const BOMB_REACH = BOMBER.radius;
