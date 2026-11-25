// How Hill 625 looks: a Korean valley in the winter of 1950. Snowy terraces, a frozen river, thatched houses, a wrecked
// railway, and pine mountains all around. Nothing in this file decides what gets hit.
import * as THREE from 'three';
import { rnd, smooth, bumps, ctex, dots, uvBox, groundMesh } from './frontkit.js';
import { part, box, limb, cylG, ballG, mat, bake } from './models.js';

const SNOW = 0xe6ecf0, BARK = 0x3a2f26, PINE = 0x2d4232, IRON = 0x2b2a2a, RUST = 0x5d4231, STRAW = 0x9a8456;
const KINDS = new Set(['slope', 'bank', 'thatch', 'clay', 'rubble', 'jar', 'hay', 'mound', 'cart', 'totem', 'pagoda', 'tent', 'boat', 'floe', 'bridge', 'truss', 'span', 'rail', 'loco', 'boxcar', 'logs', 'pine', 'icehole', 'stubble']);
export const isWinterKind = k => KINDS.has(k);

let M = null;
function materials() {
  if (M) return M;
  const std = o => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, ...o });
  const snowTex = ctex(256, (g, S) => { g.fillStyle = '#e4eaef'; g.fillRect(0, 0, S, S); dots(g, S, 2200, ['#d5dee6', '#f7fafc', '#c6d1db'], 4); });
  return (M = {
    snow: std({ map: snowTex }),
    // the flat of a terrace: snow with last year's grass and mud showing through
    field: std({ map: ctex(512, (g, S) => {
      g.fillStyle = '#dfe6eb'; g.fillRect(0, 0, S, S); dots(g, S, 4000, ['#d0dae2', '#f4f8fa', '#bfcad4'], 4);
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * S, y = Math.random() * S, r = rnd(14, 46), q = g.createRadialGradient(x, y, 0, x, y, r);
        q.addColorStop(0, i % 3 ? 'rgba(122,108,78,.75)' : 'rgba(84,70,52,.8)'); q.addColorStop(0.6, 'rgba(122,108,78,.35)'); q.addColorStop(1, 'rgba(122,108,78,0)');
        g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 500; i++) { g.strokeStyle = Math.random() < 0.5 ? 'rgba(134,116,72,.55)' : 'rgba(94,82,54,.5)'; const x = Math.random() * S, y = Math.random() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-4, 4), y - rnd(4, 11)); g.stroke(); }
    }) }),
    // the side of a terrace: earth held by field stones
    side: std({ map: ctex(256, (g, S) => {
      g.fillStyle = '#665743'; g.fillRect(0, 0, S, S); dots(g, S, 2600, ['#584a38', '#75654e', '#4c4033', '#7f7350'], 4);
      for (let i = 0; i < 120; i++) { const v = rnd(96, 150) | 0; g.fillStyle = `rgb(${v},${v - 5},${v - 14})`; const x = Math.random() * S, y = Math.random() * S, r = rnd(6, 15); for (const o of [0, -S, S]) { g.beginPath(); g.ellipse(x + o, y, r, r * 0.7, rnd(-0.4, 0.4), 0, 7); g.fill(); } }
      g.strokeStyle = 'rgba(146,128,80,.6)'; for (let i = 0; i < 200; i++) { const x = Math.random() * S, y = Math.random() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-5, 5), y + rnd(6, 16)); g.stroke(); }
    }) }),
    rubble: std({ map: ctex(256, (g, S) => {
      g.fillStyle = '#4a4238'; g.fillRect(0, 0, S, S);
      for (let r = 0; r < 7; r++) for (let i = -1; i < 6; i++) { const v = rnd(104, 158) | 0; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.beginPath(); g.ellipse(i * 46 + (r % 2) * 23 + rnd(-5, 5) + 23, r * 37 + 18, rnd(18, 25), rnd(13, 18), rnd(-0.2, 0.2), 0, 7); g.fill(); }
      dots(g, S, 900, ['#8c877c', '#5d564c', '#a8a59c'], 3);
    }) }),
    clay: std({ map: ctex(256, (g, S) => {
      g.fillStyle = '#a98d66'; g.fillRect(0, 0, S, S); dots(g, S, 2600, ['#9a7f59', '#b89c74', '#8d7350', '#c2aa83'], 4);
      g.strokeStyle = 'rgba(206,184,128,.6)'; for (let i = 0; i < 260; i++) { const x = Math.random() * S, y = Math.random() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-8, 8), y + rnd(-4, 4)); g.stroke(); }
      g.strokeStyle = 'rgba(70,54,36,.55)'; for (let i = 0; i < 8; i++) { let x = Math.random() * S, y = Math.random() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) g.lineTo(x += rnd(-14, 14), y += rnd(4, 16)); g.stroke(); }
      g.fillStyle = '#4b392a'; for (const x of [0, S - 14]) g.fillRect(x, 0, 14, S); g.fillRect(0, 0, S, 12);
      const q = g.createLinearGradient(0, S * 0.7, 0, S); q.addColorStop(0, 'rgba(60,48,36,0)'); q.addColorStop(1, 'rgba(60,48,36,.55)'); g.fillStyle = q; g.fillRect(0, 0, S, S);
    }) }),
    thatch: std({ side: THREE.DoubleSide, map: ctex(256, (g, S) => {
      g.fillStyle = '#85754f'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 2600; i++) { g.strokeStyle = ['#6f6142', '#95865f', '#5f5338', '#a59873'][i % 4]; g.globalAlpha = rnd(0.3, 0.8); const x = Math.random() * S, y = Math.random() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-3, 3), y + rnd(8, 26)); g.stroke(); }
      g.globalAlpha = 1; g.strokeStyle = '#594a2c'; g.lineWidth = 3;   // straw ropes hold it down
      for (let i = -S; i < S * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); g.beginPath(); g.moveTo(i, S); g.lineTo(i + S, 0); g.stroke(); }
    }) }),
    logs: std({ map: ctex(256, (g, S) => {
      for (let y = 0; y < S; y += 32) { const q = g.createLinearGradient(0, y, 0, y + 32); q.addColorStop(0, '#2e241b'); q.addColorStop(0.45, '#6f5a43'); q.addColorStop(1, '#2a2119'); g.fillStyle = q; g.fillRect(0, y, S, 32); }
      dots(g, S, 1400, ['#4b3b2b', '#7c664d', '#3a2e22'], 3);
    }) }),
    planks: std({ map: ctex(256, (g, S) => {
      for (let x = 0; x < S; x += 32) { g.fillStyle = `hsl(16,${rnd(20, 30) | 0}%,${rnd(20, 27) | 0}%)`; g.fillRect(x, 0, 31, S); }
      dots(g, S, 1600, ['#3d2a22', '#6d4e3f', '#8a5a3a', '#2b1f19'], 3);
      g.fillStyle = 'rgba(15,12,10,.9)'; for (let i = 0; i < 24; i++) { g.beginPath(); g.arc(Math.random() * S, Math.random() * S, rnd(1.5, 4), 0, 7); g.fill(); }
    }) }),
    steel: std({ roughness: 0.75, metalness: 0.25, map: ctex(256, (g, S) => {
      g.fillStyle = '#4a4d4d'; g.fillRect(0, 0, S, S); dots(g, S, 2400, ['#3b3e3f', '#5a5d5c', '#6b4a35', '#7a5236'], 5);
      g.fillStyle = 'rgba(20,20,20,.7)'; for (let y = 12; y < S; y += 32) for (const x of [10, S - 10]) { g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
    }) }),
    tent: std({ side: THREE.DoubleSide, map: ctex(128, (g, S) => { g.fillStyle = '#585a40'; g.fillRect(0, 0, S, S); dots(g, S, 900, ['#4c4e37', '#66684c', '#727456'], 3); g.strokeStyle = 'rgba(40,40,28,.6)'; for (const x of [32, 96]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); } }) }),
    ice: std({ color: 0xb9d2de, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.9 }),
    hole: new THREE.MeshStandardMaterial({ roughness: 0.15, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, map: ctex(256, (g, S) => {
      const n = 22, ring = (k, jag) => { g.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * 6.283, r = S / 2 * k * (1 - jag * Math.random()); g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); } g.closePath(); };
      g.strokeStyle = 'rgba(240,248,252,.8)'; g.lineWidth = 2; for (let i = 0; i < 13; i++) { const a = i / 13 * 6.283; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S * rnd(0.34, 0.49), S / 2 + Math.sin(a) * S * rnd(0.34, 0.49)); g.stroke(); }
      g.fillStyle = 'rgba(206,224,233,.95)'; ring(0.78, 0.12); g.fill(); g.fillStyle = '#132029'; ring(0.66, 0.14); g.fill(); g.fillStyle = 'rgba(40,66,80,.6)'; ring(0.4, 0.3); g.fill();
      for (let i = 0; i < 7; i++) { const a = Math.random() * 6.283, r = S * rnd(0.05, 0.25); g.fillStyle = 'rgba(205,222,231,.9)'; g.save(); g.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); g.rotate(a); g.fillRect(-8, -5, rnd(8, 20), rnd(6, 12)); g.restore(); }
    }, false) }),
    stubble: new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, map: ctex(128, (g, S) => { for (let y = 8; y < S; y += 16) for (let x = 4; x < S; x += 8) { g.strokeStyle = `rgba(${130 + rnd(0, 40) | 0},${110 + rnd(0, 30) | 0},62,.85)`; g.lineWidth = 2; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-4, 4), y - rnd(3, 8)); g.stroke(); } } }) }),
  });
}
// Texture laid on in world metres, so boxes that touch show one pattern.
function worldTop(x, z, w, d, s) {
  const g = new THREE.PlaneGeometry(w, d), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (x + p.getX(i)) / s, (z - p.getY(i)) / s);
  return g;
}
// Rounded heap over w by d, h high. e: how boxy it is.
function dome(w, d, h, e = 2.6, s = 2, skirt = 0) {
  if (e <= 2.2) {   // round ones
    const b = new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), uv = b.attributes.uv, p = b.attributes.position;
    b.scale(w / 2, h, d / 2);
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / s, p.getZ(i) / s);
    return b;
  }
  const g = new THREE.PlaneGeometry(2, 2, 14, 10), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = -p.getY(i), k = Math.max(0, 1 - Math.abs(u) ** e) ** 0.55 * Math.max(0, 1 - Math.abs(v) ** e) ** 0.55;
    p.setXYZ(i, u * w / 2, k * h - (k < 0.01 ? skirt : 0), v * d / 2); uv.setXY(i, u * w / 2 / s, v * d / 2 / s);
  }
  g.computeVertexNormals();
  return g;
}
const pineModel = (o, h, snow = SNOW, seg = 9, open = false) => {   // open: without the faces nobody sees from afar
  part(o, cylG(0.1, 0.24, h, open ? 5 : 7, open), mat(BARK), 0, h / 2, 0);
  for (const [k, r, t] of [[0.48, 1.75, 1.5], [0.7, 1.4, 1.35], [0.9, 1, 1.2], [1.08, 0.62, 1]]) {
    part(o, cylG(0.12, r, t, seg), mat(PINE), 0, h * k, 0, 0, k * 9, 0);
    part(o, cylG(0.1, r * 0.8, t * 0.72, seg, open), mat(snow), r * 0.06, h * k + t * 0.2, r * 0.06, 0, k * 9, 0);
  }
};

// Adds the parts of one box to o, which stands at the middle of its floor. Returns whether it throws shadows.
export function drawWinterBox(o, b, w, h, d, T) {
  const m = materials(), long = d >= w, L = Math.max(w, d), W = Math.min(w, d), { x, z } = o.position;
  const put = (geo, material, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0) => part(o, geo, material, px, py, pz, rx, ry, rz);
  const q = new THREE.Group();   // for things that point along z
  if (!long) q.rotation.y = Math.PI / 2;
  o.add(q);
  switch (b.kind) {
    case 'slope': {   // only the top step's height shows; the rest is inside the hill
      const s = 0.5;
      put(uvBox(w, s, d, 2), m.side, 0, h - s / 2 - 0.03, 0);
      put(worldTop(x, z, w + 0.14, d + 0.14, 9), m.field, 0, h, 0, -Math.PI / 2);
      for (const [a, c, e, f] of [[w + 0.14, 0.1, 0, d / 2 + 0.07], [w + 0.14, 0.1, 0, -d / 2 - 0.07], [0.1, d + 0.14, w / 2 + 0.07, 0], [0.1, d + 0.14, -w / 2 - 0.07, 0]]) put(uvBox(a, 0.1, c, 3), m.snow, e * 0.99, h - 0.052, f * 0.99);   // a lip of snow
      return true;
    }
    case 'bank': {
      const g = uvBox(w, h, d, 2), p = g.attributes.position, keep = h > 0.5 && W > 1.2 && L / W > 3;
      if (keep) for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { if (long) p.setX(i, p.getX(i) * 0.78); else p.setZ(i, p.getZ(i) * 0.78); }
      g.computeVertexNormals();
      put(g, m.side, 0, h / 2, 0);
      const tw = w * (keep && long ? 0.8 : 1) + 0.06, td = d * (keep && !long ? 0.8 : 1) + 0.06;
      put(uvBox(tw, 0.09, td, 3), m.snow, 0, h - 0.035, 0);
      return true;
    }
    case 'rubble': put(uvBox(w, h, d, 1.4), m.rubble, 0, h / 2, 0); put(dome(w + 0.12, d + 0.08, 0.12, 4, 3), m.snow, 0, h - 0.02, 0); return true;
    case 'clay': put(uvBox(w, h, d, 3), m.clay, 0, h / 2, 0); box(o, w + 0.04, 0.14, d + 0.04, 0, h - 0.07, 0, mat(0x4b392a)); box(o, w + 0.06, 0.35, d + 0.06, 0, 0.17, 0, mat(0x7d786e)); if (h < 2.2) put(dome(w, d, 0.1, 4, 3), m.snow, 0, h, 0); return true;
    case 'thatch': {
      put(dome(w, d, h, 2.8, 1.6, 0.16), m.thatch, 0, 0.05, 0); box(o, w * 0.94, 0.12, d * 0.94, 0, 0, 0, mat(0x5b4a30));
      put(dome(w * 0.7, d * 0.46, h * 0.3, 2, 3), m.snow, 0.1, h * 0.8, -d * 0.04);   // snow left on the ridge and here and there
      for (const [a, c, r] of [[-0.28, 0.27, 0.16], [0.05, -0.3, 0.2], [0.3, 0.28, 0.14], [-0.36, -0.22, 0.13]]) { const u = put(dome(w * r * 1.6, d * r * 1.5, 0.22, 2, 3), m.snow, a * w, h * 0.7, c * d); u.rotation.set(c * 1.3, 0, -a * 0.35); }
      put(cylG(0.16, 0.2, 0.7, 8), mat(0x6b5a44), w * 0.36, h * 0.6, d * 0.3);   // chimney
      return true;
    }
    case 'jar': {
      const c = mat(0x4a2f22, 0.45, 0.05), r = w / 2;
      put(ballG(r, 1, 16), c, 0, h * 0.46, 0).scale.y = 0.95; put(cylG(r * 0.62, r * 0.6, 0.1, 16), c, 0, h * 0.04 + 0.03, 0); put(cylG(r * 0.72, r * 0.72, 0.07, 16), c, 0, h * 0.88, 0);
      put(ballG(r * 0.7, 0.5, 14), mat(SNOW), 0, h * 0.9, 0).scale.y = 0.35;
      return true;
    }
    case 'hay': put(cylG(w * 0.3, w * 0.5, h * 0.62, 12), mat(STRAW), 0, h * 0.31, 0); put(cylG(0.05, w * 0.56, h * 0.5, 12), mat(0x87734a), 0, h * 0.78, 0); put(cylG(0.03, w * 0.4, h * 0.36, 12), mat(SNOW), 0, h * 0.9, 0); return true;
    case 'mound': put(dome(w * 1.25, d * 1.25, h, 2, 2), m.field, 0, 0, 0); return true;
    case 'cart': {
      const wd = mat(0x5f4b37), dk = mat(0x3e3125);
      box(q, 1.4, 0.12, L * 0.72, 0, 0.85, 0.2, wd, 0, 0.06);
      for (const s of [-1, 1]) { box(q, 0.08, 0.4, L * 0.7, s * 0.68, 1.05, 0.2, wd, 0, 0.06); limb(q, [s * 0.5, 0.75, L * 0.5], [s * 0.42, 0.18, L * 0.52 + 0.6], 0.05, dk); const wh = new THREE.TorusGeometry(0.55, 0.07, 6, 18); part(q, wh, dk, s * 0.82, 0.6, -0.1, 0, Math.PI / 2, 0); for (let i = 0; i < 4; i++) box(q, 0.05, 1.05, 0.06, s * 0.82, 0.6, -0.1, dk, 0, i * 0.785); }
      for (let i = 0; i < 4; i++) part(q, cylG(0.24, 0.24, 1.1, 10), mat(STRAW), (i % 2 - 0.5) * 0.55, 1.1, (i >> 1) * 0.8 - 0.1, 0, 0, Math.PI / 2); box(q, 1.2, 0.08, 1.2, 0, 1.36, 0.3, mat(SNOW), 0.04);
      return true;
    }
    case 'totem': {   // village guardian post
      const wd = mat(0x6a5138), dk = mat(0x241c15), r = w * 0.44;
      put(cylG(r, r * 1.08, h, 12), wd, 0, h / 2, 0, 0, 0, Math.sin(x) * 0.04); put(cylG(r * 0.7, r * 1.3, 0.22, 12), dk, 0, h - 0.12, 0); put(cylG(0.02, r * 0.75, 0.2, 12), mat(SNOW), 0, h + 0.08, 0);
      for (const s of [-1, 1]) { put(ballG(0.075, 1, 10), mat(0xd9d2c0), s * 0.1, h - 0.45, -r * 0.92); put(ballG(0.035, 1, 8), dk, s * 0.1, h - 0.45, -r * 1.2); box(o, 0.16, 0.04, 0.06, s * 0.1, h - 0.33, -r, dk, 0, 0, 0, s * 0.35); }
      box(o, 0.1, 0.24, 0.12, 0, h - 0.6, -r, wd, 0.03); box(o, 0.26, 0.09, 0.06, 0, h - 0.82, -r, dk); box(o, 0.22, 0.04, 0.07, 0, h - 0.82, -r, mat(0xd9d2c0)); box(o, 0.16, 0.8, 0.03, 0, h - 1.4, -r, mat(0x8b7355));
      return true;
    }
    case 'pagoda': {
      const s = mat(0xa29d92), e = mat(0x8e897e);
      box(o, w, 0.3, d, 0, 0.15, 0, e); box(o, w * 0.8, 0.45, d * 0.8, 0, 0.5, 0, s);
      let y = 0.72;
      for (const k of [0.62, 0.5, 0.4]) { const bh = k * 0.75; box(o, w * k, bh, d * k, 0, y + bh / 2, 0, s); y += bh; box(o, w * (k + 0.3), 0.13, d * (k + 0.3), 0, y + 0.06, 0, e); box(o, w * (k + 0.22), 0.1, d * (k + 0.22), 0, y + 0.17, 0, mat(SNOW)); y += 0.2; }
      put(cylG(0.06, 0.16, h - y, 8), s, 0, y + (h - y) / 2, 0);
      return true;
    }
    case 'tent': {
      const g = new THREE.BufferGeometry(), hw = W / 2, hl = L / 2, e = h * 0.42, v = [[-hw, 0], [-hw, e], [0, h], [hw, e], [hw, 0]], pos = [], uv = [];
      const tri = (...ps) => { for (const p of ps) { pos.push(...p); uv.push((p[0] + p[2]) / 1.6, p[1] / 1.6); } };
      for (let i = 0; i < 4; i++) { const [a, c] = v[i], [f, k] = v[i + 1]; tri([a, c, hl], [f, k, hl], [a, c, -hl]); tri([f, k, hl], [f, k, -hl], [a, c, -hl]); }
      for (const s of [-hl, hl]) for (const [i, j, k] of [[0, 1, 3], [0, 3, 4], [1, 2, 3]]) tri([...v[i], s], [...v[j], s], [...v[k], s]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
      part(q, g, m.tent);
      const a = Math.atan2(h - e, hw), l = Math.hypot(h - e, hw);
      for (const s of [-1, 1]) { const c = new THREE.BoxGeometry(l * 0.86, 0.07, L * 0.94); part(q, c, m.snow, s * hw * 0.52, (h + e) / 2 + 0.1, 0, 0, 0, -s * a); box(q, 0.9, 1.5, 0.05, 0, 0.75, s * (hl + 0.02), mat(0x3a3c2a)); }
      return true;
    }
    case 'boat': {
      const wd = mat(0x5a4836), g = new THREE.BoxGeometry(W, h, L, 1, 1, 6), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = Math.abs(p.getZ(i)) / (L / 2), low = p.getY(i) < 0; p.setX(i, p.getX(i) * (1 - k ** 3 * 0.5) * (low ? 0.7 : 1)); if (low) p.setY(i, p.getY(i) + k ** 3 * h * 0.6); }
      g.computeVertexNormals();
      part(q, g, wd, 0, h / 2, 0, 0, 0, 0.06); box(q, W * 0.66, 0.06, L * 0.7, 0, h + 0.01, 0, m.snow); limb(q, [W * 0.3, h, -L * 0.3], [W * 0.7, h + 0.4, -L * 0.75], 0.05, wd);
      return true;
    }
    case 'floe': {   // slabs of ice pushed up on end
      const g = new THREE.BoxGeometry(L * 0.52, h * 1.15, W * 0.4);
      for (const [p, t, y, s] of [[-L * 0.25, 0.28, 0.42, 1], [L * 0.2, -0.34, 0.45, 0.92], [0, 0.12, 0.36, 0.85]]) { const u = part(q, g, m.ice, 0, h * y, p, t * 0.8, Math.PI / 2 + t, t); u.scale.setScalar(s); }
      part(q, dome(W * 1.5, L * 1.15, h * 0.35, 2, 3), m.snow);
      return true;
    }
    case 'bridge': {
      put(uvBox(w, h, d, 2), m.steel, 0, h / 2, 0); box(o, w * 0.96, 0.05, d * 0.98, 0, h, 0, mat(0x4a4038));
      for (const s of [-1, 1]) { const e = s * d / 2; for (const k of [-1.2, 0.3, 1.4]) limb(o, [k, h * 0.5, e], [k + rnd(-0.4, 0.4), h * 0.5 - rnd(-0.2, 0.5), e + s * rnd(0.3, 0.8)], 0.035, mat(RUST)); }   // torn iron
      return true;
    }
    case 'truss': {
      put(uvBox(w, h, d, 2), m.steel, 0, h / 2, 0);
      const n = Math.round(L / 1.9), H = 3.2, st = mat(0x45484a, 0.8, 0.2);
      for (let i = 0; i <= n; i++) { const p = -L / 2 + i * L / n; box(o, 0.14, H, 0.14, 0, H / 2, p, st); if (i < n) { const c = p + L / n; limb(o, [0, i % 2 ? H : h, p], [0, i % 2 ? h : H, c], 0.06, st); } }
      box(o, 0.22, 0.22, L, 0, H, 0, st); box(o, 0.24, 0.08, L, 0, H + 0.14, 0, mat(SNOW));
      return true;
    }
    case 'span': put(uvBox(w, h, d + 0.1, 2), m.steel, 0, h / 2, 0, 0.22); for (const s of [-1, 1]) limb(o, [s * w * 0.48, 0.1, -d], [s * w * 0.48, 0.45, d], 0.07, mat(RUST)); return true;
    case 'rail':
      for (let i = 0; i < 3; i++) box(o, w, 0.09, 0.26, 0, 0.045, (i - 1) * d / 3, mat(0x43372b));
      for (const s of [-1, 1]) { box(o, 0.06, 0.1, d, s * 0.72, 0.14, 0, mat(0x55504a, 0.5, 0.5)); box(o, 0.14, 0.03, d, s * 0.72, 0.1, 0, mat(0x3b3733, 0.6, 0.4)); }
      return false;
    case 'loco': {   // steam engine off its rails, boiler toward -z
      const ir = mat(IRON, 0.65, 0.35), ru = mat(RUST, 0.9, 0.2), dk = mat(0x191817, 0.8, 0.2), t = new THREE.Group();
      t.rotation.z = 0.06; q.add(t);
      box(t, 2.3, 0.3, L, 0, 1.15, 0, dk); part(t, cylG(0.95, 0.95, L * 0.56, 22), ir, 0, 2.05, -L * 0.19, Math.PI / 2); part(t, cylG(0.97, 0.97, 0.1, 22), ru, 0, 2.05, -L * 0.1, Math.PI / 2); part(t, cylG(0.97, 0.97, 0.1, 22), ru, 0, 2.05, -L * 0.3, Math.PI / 2);
      part(t, cylG(0.98, 0.9, 0.5, 22), dk, 0, 2.05, -L * 0.46, -Math.PI / 2); part(t, cylG(0.5, 0.5, 0.12, 18), ru, 0, 2.05, -L * 0.492, Math.PI / 2); part(t, cylG(0.3, 0.2, 0.7, 14), dk, 0, 3.2, -L * 0.38); part(t, ballG(0.34, 0.5, 14), ru, 0, 2.95, -L * 0.2); part(t, ballG(0.3, 0.5, 14), ir, 0, 2.95, -L * 0.05);
      box(t, 2.5, 1.9, 2, 0, 2.2, L * 0.24, ir, 0.04); box(t, 2.7, 0.12, 2.3, 0, 3.2, L * 0.24, ru); box(t, 2.6, 0.1, 2.2, 0, 3.3, L * 0.24, mat(SNOW)); for (const s of [-1, 1]) box(t, 0.04, 0.6, 0.8, s * 1.26, 2.6, L * 0.24, dk);
      box(t, 2.3, 1.3, 1.9, 0, 1.9, L * 0.4, ru, 0.04); box(t, 2, 0.2, 1.6, 0, 2.6, L * 0.4, mat(0x1b1b1c));
      for (const s of [-1, 1]) { for (let i = 0; i < 3; i++) part(t, cylG(0.62, 0.62, 0.14, 20), ru, s * 0.95, 0.66, -L * 0.2 + i * 1.4, 0, 0, Math.PI / 2); for (const p of [-L * 0.42, L * 0.36, L * 0.44]) part(t, cylG(0.4, 0.4, 0.14, 16), ru, s * 0.95, 0.44, p, 0, 0, Math.PI / 2); box(t, 0.07, 0.14, 3.2, s * 1.06, 0.7, -L * 0.05, ir); box(t, 0.5, 0.6, 0.9, s * 1.05, 0.9, -L * 0.36, dk, 0.06); for (let i = 0; i < 9; i++) part(t, cylG(0.05, 0.05, 0.02, 8), dk, s * 0.955, 1.6 + (i * 0.37) % 0.9, -L * 0.42 + i * 0.5, 0, 0, Math.PI / 2); }
      box(t, 1.9, 0.16, 3.4, 0, 2.94, -L * 0.2, mat(SNOW), 0.08);
      return true;
    }
    case 'boxcar': {
      const t = new THREE.Group(); t.rotation.z = -0.04; q.add(t);
      part(t, uvBox(W, h - 0.9, L, 2.4), m.planks, 0, 0.9 + (h - 0.9) / 2 - 0.1, 0); box(t, W, 0.22, L + 0.3, 0, 0.75, 0, mat(0x2a2827)); for (const s of [-1, 1]) { box(t, 0.08, 1.7, 1.7, s * W / 2, 1.75, 0, mat(0x33231c)); for (const p of [-0.9, 0.9, -L / 2 + 0.1, L / 2 - 0.1]) box(t, 0.07, h - 0.9, 0.12, s * W / 2, 1.85, p, mat(0x2a2827)); for (const p of [-L * 0.36, -L * 0.2, L * 0.2, L * 0.36]) part(t, cylG(0.42, 0.42, 0.14, 16), mat(RUST, 0.9, 0.2), s * 0.8, 0.42, p, 0, 0, Math.PI / 2); }
      part(t, dome(W + 0.3, L + 0.2, 0.34, 3, 3), m.snow, 0, h - 0.12, 0);
      return true;
    }
    case 'logs': put(uvBox(w, h, d, 1.6), m.logs, 0, h / 2, 0); return true;
    case 'pine': pineModel(o, h); return true;
    case 'icehole': put(new THREE.CircleGeometry(w / 2, 24), m.hole, 0, 0.05, 0, -Math.PI / 2, 0, 0); return false;
    case 'stubble': put(worldTop(x, z, w, d, 1.6), m.stubble, 0, 0.02, 0, -Math.PI / 2); return false;
  }
  return true;
}

/* ---------------- the valley ---------------- */
const RIVER = [-28, 8];   // middle of the river, half its width
export function winterHeight(x, z, hx, hz) {
  const d = Math.max(Math.abs(x) - hx, Math.abs(z) - hz);
  if (d <= 0) return 0;
  const inRiver = Math.abs(x) > hx ? 1 - smooth(RIVER[1], RIVER[1] + 4 + d * 0.5, Math.abs(z - RIVER[0] - Math.sin(d * 0.02) * d * 0.16)) : 0;   // the river goes on between the mountains
  const bluff = smooth(0, 0.7, d) * (3.6 + bumps(x, z) * 0.9), ridge = Math.abs(Math.sin(x * 0.019 + z * 0.011 + 1) + Math.sin(z * 0.023 - x * 0.007) * 0.7);
  const far = smooth(3, 190, d) * (30 + (1.7 - ridge) * 38) + bumps(x * 0.35, z * 0.35) * smooth(3, 26, d) * 3.2 + Math.min(d, 30) * 0.16;
  return (bluff + far) * (1 - inRiver) - inRiver * 0.02;
}
export function buildWinter(map) {
  const g = new THREE.Group(), [hx, hz] = map.size, H = (x, z) => winterHeight(x, z, hx, hz), m = materials(), q = new THREE.Color();
  const C = { snow: 0xe9eef2, shade: 0xcfd9e1, mud: 0x8d8069, grass: 0xa39674, rock: 0x7d7a75, wood: 0x55645b, bed: 0xa3b7c2 };
  for (const k in C) C[k] = new THREE.Color(C[k]);
  g.add(groundMesh(map, H, (c, x, z, n, n2) => {
    c.copy(C.snow).lerp(C.shade, n * 0.5 + 0.5);
    c.lerp(C.grass, smooth(0.2, 0.8, n2 + n * 0.25) * 0.55);
    const path = Math.min(Math.abs(x + 25.5 + Math.sin(z * 0.12) * 1.2), Math.abs(x - 32) * 0.8, Math.abs(z + 16 + Math.sin(x * 0.2))) - 1.4;   // trodden roads
    if (Math.abs(x) < hx && z > -18) c.lerp(C.mud, (1 - smooth(0, 1.8, path + n * 0.5)) * 0.75);
    if (Math.abs(z) > 40 && Math.abs(z) < hz + 1) c.lerp(C.mud, smooth(0, 0.8, n2) * 0.3);
    c.lerp(C.bed, 1 - smooth(6.5, 9, Math.abs(z - RIVER[0]) + n * 0.6));
    const d = Math.max(Math.abs(x) - hx, Math.abs(z) - hz);
    if (d > 0 && H(x, z) > 0.4) { q.copy(C.rock).lerp(C.snow, smooth(0.6, 3.5, d + n)).lerp(C.wood, smooth(6, 30, d) * smooth(-0.5, 0.6, n2 + 0.15) * 0.55); c.lerp(q, smooth(0, 0.3, d)); }
  }));
  // the ice
  const iceTex = ctex(512, (c, S) => {
    c.fillStyle = '#a9c3d0'; c.fillRect(0, 0, S, S); dots(c, S, 2400, ['#9ab6c5', '#c2d6df', '#8eabbb'], 6);
    for (let i = 0; i < 18; i++) { const x = Math.random() * S, y = Math.random() * S, r = rnd(30, 90), k = c.createRadialGradient(x, y, 0, x, y, r); k.addColorStop(0, 'rgba(236,243,247,.9)'); k.addColorStop(1, 'rgba(236,243,247,0)'); for (const o of [0, -S, S]) for (const p of [0, -S, S]) { c.save(); c.translate(o, p); c.fillStyle = k; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore(); } }
    for (let i = 0; i < 46; i++) { let x = Math.random() * S, y = Math.random() * S, a = Math.random() * 6.283; c.strokeStyle = i % 3 ? 'rgba(240,248,252,.75)' : 'rgba(70,105,125,.55)'; c.lineWidth = rnd(0.6, 2.2); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 7; k++) { a += rnd(-0.6, 0.6); x += Math.cos(a) * 22; y += Math.sin(a) * 22; c.lineTo(x, y); } c.stroke(); }
  });
  iceTex.repeat.set(36, 1.5);
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(420, 17.5, 1, 1), new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.22, metalness: 0.05 }));
  ice.rotation.x = -Math.PI / 2; ice.position.set(0, 0.018, RIVER[0]); ice.receiveShadow = true; g.add(ice);
  // ragged snow along the edges of the ice
  const drift = new THREE.Group();
  for (let x = -hx; x < hx; x += rnd(2.2, 4)) for (const s of [-1, 1]) part(drift, dome(rnd(3, 5), rnd(1.4, 2.6), rnd(0.08, 0.2), 2, 3), m.snow, x, 0, RIVER[0] + s * (RIVER[1] + rnd(0.1, 0.9)), 0, rnd(-0.2, 0.2), 0);
  // drifts and dry grass against the foot of the hill and the walls
  for (let i = 0; i < 80; i++) { const x = rnd(-hx, hx), z = rnd(-52, 52); if (Math.abs(z - RIVER[0]) < 10 || x > -25 && x < 29 && z > -7 && z < 37) continue; part(drift, dome(rnd(1.6, 4), rnd(1.2, 3), rnd(0.06, 0.2), 2, 3), m.snow, x, 0, z, 0, rnd(0, 3), 0); }
  g.add(bake(drift, false));
  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });

  const O = new THREE.Object3D(), many = (model, n, place) => {   // many copies, few draw calls
    const src = bake(model, false);
    const spots = [];
    for (let i = 0; i < n; i++) if (place(i)) { O.updateMatrix(); spots.push(O.matrix.clone()); }
    for (const c of src.children) { const im = new THREE.InstancedMesh(c.geometry, c.material, spots.length); spots.forEach((s, i) => im.setMatrixAt(i, s)); im.frustumCulled = false; g.add(im); }
  };
  const tree = new THREE.Group(); pineModel(tree, 5.2, 0xdbe4ea, 7, true);
  many(tree, 620, i => {
    const a = rnd(0, 6.283), r = 4 + Math.random() ** 1.6 * 150, e = Math.max(Math.abs(Math.cos(a)) / (hx + r), Math.abs(Math.sin(a)) / (hz + r)), x = Math.cos(a) / e, z = Math.sin(a) / e, y = H(x, z);
    if (y < 2) return false;
    O.position.set(x, y - 0.2, z); O.rotation.set(rnd(-0.04, 0.04), rnd(0, 6), rnd(-0.04, 0.04)); O.scale.setScalar(rnd(0.8, 1.7));
    return true;
  });
  const dead = new THREE.Group();
  part(dead, cylG(0.08, 0.26, 5, 6), mat(BARK), 0, 2.5, 0); for (let k = 0; k < 5; k++) limb(dead, [0, 2 + k * 0.6, 0], [Math.cos(k * 2.4) * 1.4, 3 + k * 0.6, Math.sin(k * 2.4) * 1.4], 0.05, mat(BARK));
  many(dead, 120, () => { const s = Math.random() < 0.5 ? -1 : 1, x = s * rnd(hx + 1.5, hx + 40), z = rnd(-70, 80), y = H(x, z); if (y < 2) return false; O.position.set(x, y - 0.1, z); O.rotation.set(rnd(-0.1, 0.1), rnd(0, 6), rnd(-0.1, 0.1)); O.scale.setScalar(rnd(0.7, 1.4)); return true; });
  const tuft = new THREE.Group();
  for (let i = 0; i < 7; i++) { const a = i * 0.9; part(tuft, cylG(0.002, 0.016, 0.42, 3, true), mat(i % 2 ? 0xa48f5c : 0x83714a), Math.cos(a) * 0.07, 0.19, Math.sin(a) * 0.07, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
  const slopes = map.boxes.slopes || [], top = (x, z) => slopes.reduce((y, b) => (b.max[1] > y && x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2] ? b.max[1] : y), 0);
  many(tuft, 1100, i => {   // most of it grows along the edges of the terraces
    let x, z;
    if (i % 3) { const b = slopes[Math.random() * slopes.length | 0], s = Math.random() < 0.5; x = s ? rnd(b.min[0], b.max[0]) : (Math.random() < 0.5 ? b.min[0] + 0.12 : b.max[0] - 0.12); z = s ? (Math.random() < 0.6 ? b.min[2] + 0.12 : b.max[2] - 0.12) : rnd(b.min[2], b.max[2]); }
    else { x = rnd(-hx, hx); z = rnd(-52, 52); if (Math.abs(z - RIVER[0]) < 8.5) return false; }
    O.position.set(x, top(x, z) - 0.02, z); O.rotation.set(0, rnd(0, 6), 0); O.scale.setScalar(rnd(0.6, 1.4));
    return true;
  });
  // where the line leaves the valley: tunnels at both ends
  const line = new THREE.Group(), stone = mat(0x7b766c), hole = mat(0x0d0d0e);
  for (const s of [-1, 1]) { const z = s * (hz + 0.35); box(line, 8, 6.4, 1.4, 32, 3.2, z, stone, 0.1); box(line, 4, 3, 0.2, 32, 1.5, z - s * 0.66, hole); part(line, cylG(2, 2, 0.2, 24), hole, 32, 3, z - s * 0.66, Math.PI / 2); box(line, 8.6, 0.4, 1.8, 32, 6.4, z, mat(0x8d887d)); box(line, 8.5, 0.2, 1.7, 32, 6.65, z, mat(SNOW)); }
  // telegraph poles, most of them broken
  for (let i = 0; i < 9; i++) { const z = -14 + i * 8, h = i % 3 === 1 ? 2.6 : 6; part(line, cylG(0.1, 0.14, h, 8), mat(0x4a3b2c), 41.2, h / 2, z, 0, 0, Math.sin(i * 3) * 0.06); if (h > 3) { box(line, 1.5, 0.12, 0.12, 41.2, h - 0.5, z, mat(0x4a3b2c)); if (i % 3 === 2 && i < 8) limb(line, [41, h - 0.45, z], [41, 3.2, z + 4], 0.012, hole); } }
  // thatched houses far off, some with their roofs gone
  for (let i = 0; i < 12; i++) { const s = i % 2 ? 1 : -1, x = s * rnd(52, 96), z = rnd(2, 70), y = H(x, z), ry = rnd(-0.6, 0.6); box(line, 8, 3, 5, x, y + 1, z, mat(0x9a8160), 0, 0, ry); if (i % 3) { part(line, dome(9.6, 6.6, 1.9, 2.8, 2, 0.2), m.snow, x, y + 2.4, z, 0, ry, 0); } }
  const lined = bake(line, true);
  lined.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  g.add(lined);
  g.userData.update = () => {};
  return g;
}
