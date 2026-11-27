// Weapon and equipment models. The same gun is used in your hands, on other soldiers and on the character page.
// The barrel points to -z. buildGun returns { g, muzzle, hip, ads, left, right }: left and right are the hand positions.
import * as THREE from 'three';
import { box, part, cylG, ballG, mat, camoMat, CAMO } from './models.js';

const METAL = mat(0x3b3f44, 0.5, 0.35), POLY = mat(0x34363a, 0.8, 0.05);
const RED = new THREE.MeshBasicMaterial({ color: 0xff2a2a }), GREEN = new THREE.MeshBasicMaterial({ color: 0x5fff6a });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FINISH = { tan: 0xb39a6c, olive: 0x59633c, snow: 0xe2e7ea };
const FIN_CAMO = { woodland: 'woodland', tiger: 'tiger', pixel: 'pixel', ember: 'ember' };
// Coloured parts of the gun: its own colour, or the chosen finish.
function paint(finish, own) {
  if (FIN_CAMO[finish] && CAMO[FIN_CAMO[finish]]) return camoMat(FIN_CAMO[finish], 2.4, 0.75, 0.1);
  return mat(FINISH[finish] ?? own, 0.8, 0.08);
}
const vp = (g, w, h, d, x, y, z, m, rx = 0) => box(g, w, h, d, x, y, z, m, Math.min(w, h, d) > 0.025 ? 0.006 : 0, rx);
const vcyl = (g, r, l, x, y, z, m) => part(g, cylG(r, r, l), m, x, y, z, Math.PI / 2);
// open red-dot frame so the world stays visible when aiming. Iron sights: ads.y puts the top of the front post on the aim point
function sight(g, dotMat, sz = -0.02, sy = 0.09) {
  vp(g, 0.054, 0.008, 0.06, 0, sy + 0.025, sz, METAL); vp(g, 0.054, 0.008, 0.06, 0, sy - 0.025, sz, METAL);
  vp(g, 0.008, 0.058, 0.06, -0.025, sy, sz, METAL); vp(g, 0.008, 0.058, 0.06, 0.025, sy, sz, METAL);
  part(g, cylG(0.0016, 0.0016, 0.0005, 10), dotMat, 0, sy, sz - 0.02, Math.PI / 2);
}

function rifle(f) {
  const g = new THREE.Group(), c = paint(f, 0x34363a);
  vp(g, 0.07, 0.09, 0.42, 0, 0, 0, METAL); vp(g, 0.075, 0.08, 0.3, 0, -0.005, -0.35, c);
  vcyl(g, 0.013, 0.24, 0, 0.008, -0.6, METAL); vp(g, 0.03, 0.03, 0.06, 0, 0.008, -0.74, METAL);
  vp(g, 0.05, 0.17, 0.08, 0, -0.12, -0.07, METAL, 0.18); vp(g, 0.04, 0.12, 0.05, 0, -0.09, 0.12, c, -0.35);
  vp(g, 0.055, 0.085, 0.22, 0, -0.015, 0.31, c);
  vp(g, 0.03, 0.02, 0.3, 0, 0.055, -0.12, METAL);
  sight(g, RED);
  return { g, muzzle: V(0, 0.008, -0.78), hip: V(0.17, -0.16, -0.42), ads: V(0, -0.09, -0.3), left: [0, -0.05, -0.36], right: [0, -0.1, 0.1] };
}
function sniper(f) {
  const g = new THREE.Group(), c = paint(f, 0x3d4a2f);
  vp(g, 0.07, 0.09, 0.5, 0, 0, 0, METAL); vp(g, 0.08, 0.07, 0.3, 0, -0.01, -0.38, c);
  vcyl(g, 0.015, 0.5, 0, 0.01, -0.75, METAL); vp(g, 0.035, 0.035, 0.08, 0, 0.01, -1.02, METAL);
  vcyl(g, 0.028, 0.32, 0, 0.095, -0.06, METAL); vcyl(g, 0.034, 0.05, 0, 0.095, -0.22, METAL); vcyl(g, 0.034, 0.05, 0, 0.095, 0.1, METAL);
  vp(g, 0.05, 0.1, 0.06, 0, -0.1, -0.05, METAL); vp(g, 0.04, 0.12, 0.05, 0, -0.09, 0.15, c, -0.35);
  vp(g, 0.06, 0.11, 0.26, 0, -0.03, 0.36, c);
  return { g, muzzle: V(0, 0.01, -1.07), hip: V(0.17, -0.17, -0.45), ads: V(0, -0.095, -0.28), left: [0, -0.06, -0.38], right: [0, -0.1, 0.13] };
}
// Shared builder for the other long guns. Same open sight as the Carbine.
function longGun(f, { body, guard, barrel, stock, color, mag, grip, extra }) {
  const g = new THREE.Group(), col = paint(f, color), front = -body / 2 - guard, gz = grip ?? body * 0.3;
  vp(g, 0.07, 0.09, body, 0, 0, 0, METAL); vp(g, 0.078, 0.08, guard, 0, -0.005, -body / 2 - guard / 2, col);
  vcyl(g, 0.014, barrel, 0, 0.008, front - barrel / 2, METAL);
  vp(g, 0.04, 0.12, 0.05, 0, -0.09, gz, f === 'factory' ? POLY : col, -0.35);
  if (mag) vp(g, mag[0], mag[1], mag[2], 0, -0.04 - mag[1] / 2, mag[4] ?? -0.06, METAL, mag[3] || 0);
  if (stock) vp(g, 0.055, 0.085, stock, 0, -0.015, body / 2 + stock / 2, col);
  sight(g, GREEN);
  if (extra) extra(g, col);
  return { g, muzzle: V(0, 0.008, front - barrel), hip: V(0.17, -0.16, -0.4), ads: V(0, -0.09, -0.3), left: [0, -0.05, front + guard * 0.45], right: [0, -0.1, gz] };
}
const LONG = {
  smg: { body: 0.3, guard: 0.14, barrel: 0.1, stock: 0.12, color: 0x7a5a2a, mag: [0.04, 0.22, 0.05, 0.1] },
  shotgun: { body: 0.36, guard: 0.3, barrel: 0.2, stock: 0.24, color: 0x6b4226, extra: (g, col) => { vcyl(g, 0.016, 0.42, 0, -0.035, -0.4, METAL); vp(g, 0.06, 0.06, 0.16, 0, -0.04, -0.36, col); } },
  dmr: { body: 0.44, guard: 0.3, barrel: 0.36, stock: 0.28, color: 0x4d5a3c, mag: [0.05, 0.12, 0.08, 0.05] },
  lmg: { body: 0.48, guard: 0.26, barrel: 0.3, stock: 0.22, color: 0x3e4a52, mag: [0.15, 0.15, 0.16], extra: g => { for (const s of [-1, 1]) vp(g, 0.012, 0.16, 0.012, s * 0.05, -0.1, -0.5, METAL); } },
  battle: { body: 0.46, guard: 0.28, barrel: 0.26, stock: 0.26, color: 0x5a4630, mag: [0.05, 0.17, 0.1, 0.1], extra: g => { vp(g, 0.032, 0.032, 0.1, 0, 0.008, -0.74, METAL); vp(g, 0.012, 0.05, 0.02, 0, 0.06, -0.46, METAL); } },
  bullpup: { body: 0.52, guard: 0.16, barrel: 0.16, stock: 0.06, color: 0x4a5560, mag: [0.045, 0.16, 0.07, -0.08, 0.14], grip: -0.04,
    extra: (g, col) => { vp(g, 0.062, 0.1, 0.24, 0, -0.03, 0.16, col); vp(g, 0.03, 0.08, 0.1, 0, -0.07, -0.16, col, 0.5); } },
};
function pistol(f) {
  const g = new THREE.Group(), c = paint(f, 0x34363a);
  vp(g, 0.04, 0.045, 0.21, 0, 0.035, -0.05, METAL); vp(g, 0.037, 0.03, 0.17, 0, 0.005, -0.04, c);
  vp(g, 0.035, 0.11, 0.05, 0, -0.06, 0.04, c, -0.25); vp(g, 0.006, 0.012, 0.006, 0, 0.063, -0.15, METAL);
  vp(g, 0.014, 0.012, 0.006, 0, 0.063, 0.05, METAL);
  return { g, muzzle: V(0, 0.035, -0.17), hip: V(0.14, -0.15, -0.36), ads: V(0, -0.069, -0.34), left: [-0.03, -0.07, 0.03], right: [0.01, -0.07, 0.05] };
}
function revolver(f) {
  const g = new THREE.Group(), c = paint(f, 0x5a3a24);
  vcyl(g, 0.013, 0.22, 0, 0.042, -0.16, METAL); vp(g, 0.018, 0.026, 0.2, 0, 0.018, -0.15, METAL);
  vcyl(g, 0.03, 0.075, 0, 0.025, -0.01, METAL); vp(g, 0.03, 0.075, 0.1, 0, 0.03, 0.02, METAL);
  vp(g, 0.034, 0.12, 0.05, 0, -0.055, 0.075, c, -0.35); vp(g, 0.01, 0.03, 0.02, 0, 0.057, 0.075, METAL, -0.4);   // hammer, kept under the sight line
  vp(g, 0.006, 0.018, 0.02, 0, 0.066, -0.25, METAL);
  return { g, muzzle: V(0, 0.042, -0.29), hip: V(0.14, -0.15, -0.38), ads: V(0, -0.075, -0.36), left: [-0.03, -0.07, 0.06], right: [0.01, -0.07, 0.08] };
}
function mpistol(f) {
  const g = new THREE.Group(), c = paint(f, 0x2f3336);
  vp(g, 0.045, 0.06, 0.24, 0, 0.03, -0.05, METAL); vp(g, 0.042, 0.03, 0.18, 0, -0.008, -0.05, c);
  vcyl(g, 0.012, 0.06, 0, 0.035, -0.2, METAL); vp(g, 0.036, 0.1, 0.05, 0, -0.06, 0.03, c, -0.15);
  vp(g, 0.026, 0.14, 0.036, 0, -0.14, 0.022, METAL, -0.05); vp(g, 0.012, 0.012, 0.16, 0.03, 0.035, 0.1, METAL);
  vp(g, 0.006, 0.014, 0.006, 0, 0.067, -0.16, METAL); vp(g, 0.014, 0.014, 0.006, 0, 0.067, 0.06, METAL);
  return { g, muzzle: V(0, 0.035, -0.23), hip: V(0.14, -0.15, -0.37), ads: V(0, -0.074, -0.34), left: [-0.03, -0.08, 0.02], right: [0.01, -0.07, 0.04] };
}
const BUILD = { rifle, sniper, pistol, revolver, mpistol };
export function buildGun(id, finish = 'factory') {
  return BUILD[id] ? BUILD[id](finish) : longGun(finish, LONG[id] || LONG.battle);
}

export function buildEquip(id) {
  const g = new THREE.Group();
  if (id === 'frag') {
    const body = mat(0x46522f, 0.7, 0.1);
    part(g, ballG(0.045), body).scale.set(1, 1.2, 1);
    for (const y of [-0.02, 0.005, 0.03]) part(g, cylG(0.046, 0.046, 0.006), mat(0x39432a, 0.8), 0, y, 0);
    part(g, cylG(0.014, 0.02, 0.03), METAL, 0, 0.06, 0);
    vp(g, 0.014, 0.07, 0.008, 0.03, 0.045, 0, METAL); vp(g, 0.034, 0.008, 0.012, 0.014, 0.078, 0, METAL);
  } else if (id === 'smoke') {
    part(g, cylG(0.036, 0.036, 0.13), mat(0x8d9399, 0.7, 0.1));
    part(g, cylG(0.037, 0.037, 0.022), mat(0xe6e2d4, 0.8), 0, 0.02, 0);
    part(g, cylG(0.014, 0.022, 0.03), METAL, 0, 0.08, 0);
    vp(g, 0.014, 0.08, 0.008, 0.034, 0.05, 0, METAL); vp(g, 0.036, 0.008, 0.012, 0.016, 0.096, 0, METAL);
  } else if (id === 'flash') {
    part(g, cylG(0.032, 0.032, 0.12), mat(0x2d3034, 0.6, 0.3));
    for (const y of [-0.03, 0, 0.03]) part(g, cylG(0.033, 0.033, 0.012), mat(0x9fc6e8, 0.5), 0, y, 0);
    for (const y of [-0.065, 0.065]) part(g, cylG(0.037, 0.037, 0.016, 6), METAL, 0, y, 0);
    part(g, cylG(0.014, 0.02, 0.03), METAL, 0, 0.085, 0); vp(g, 0.014, 0.08, 0.008, 0.032, 0.055, 0, METAL);
  } else if (id === 'fire') {
    part(g, cylG(0.04, 0.04, 0.12), mat(0x8a3a1c, 0.35, 0.1)); part(g, cylG(0.016, 0.038, 0.04), mat(0x8a3a1c, 0.35, 0.1), 0, 0.08, 0); part(g, cylG(0.016, 0.016, 0.05), mat(0x8a3a1c, 0.35, 0.1), 0, 0.12, 0);
    box(g, 0.026, 0.07, 0.026, 0.005, 0.165, 0, mat(0xe8dcc2, 1), 0.006, 0, 0, 0.2); part(g, cylG(0.041, 0.041, 0.05), mat(0xd8b45a, 0.8), 0, -0.01, 0);
  } else if (id === 'charge') {
    box(g, 0.22, 0.07, 0.15, 0, 0, 0, mat(0x6f6a4a, 0.9), 0.015);
    for (const x of [-0.06, 0.06]) box(g, 0.025, 0.076, 0.156, x, 0, 0, mat(0x23261f, 0.9));
    box(g, 0.07, 0.03, 0.06, 0, 0.045, 0, METAL, 0.006); part(g, ballG(0.012, 1, 8), RED, 0.02, 0.066, 0); part(g, cylG(0.003, 0.003, 0.1, 6), METAL, -0.025, 0.1, 0);
  } else {
    box(g, 0.2, 0.14, 0.07, 0, 0, 0, mat(0x4a5638, 0.9), 0.015);
    for (const s of [1, -1]) { box(g, 0.07, 0.022, 0.004, 0, 0, s * 0.037, mat(0xf1efe6, 0.8)); box(g, 0.022, 0.07, 0.004, 0, 0, s * 0.037, mat(0xf1efe6, 0.8)); }
    box(g, 0.21, 0.018, 0.075, 0, 0.035, 0, mat(0x2f3626, 0.9));
  }
  return g;
}
