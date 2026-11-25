// Builds a dressed soldier. Every outfit keeps the same body size and the same bright team marks
// (arm bands, headgear band, back patch), so gear never hides which side someone is on.
import * as THREE from 'three';
import { box, part, limb, cylG, ballG, torusG, mat, camoMat, CAMO, bake, dispose } from './models.js';
import { buildGun } from './arsenal.js';
import { WEAPONS } from './shared/weapons.js';
import { cleanGear } from './shared/gear.js';

export const TEAMC = {
  red: { u: 0xb59a6a, v: 0x6e5c40, band: 0xd03a28, helm: 0x8a7550 },
  blue: { u: 0x5b6b43, v: 0x3e4832, band: 0x2f7fe0, helm: 0x4f5a3a },
};
const SKIN = { a: 0xf0c8a4, b: 0xd9a67c, c: 0xb9805a, d: 0x8a5a3c, e: 0x5c3b28 };
const GLOVE = { black: 0x1f2022, coyote: 0x8a6f48, olive: 0x4d5636, grey: 0x5a5e62 };
const BOOT = { black: 0x1d1a18, tan: 0xa58a5f, brown: 0x4c3424, grey: 0x55585b };
const DARK = mat(0x1c1d1f, 0.6, 0.1), BLACK = mat(0x151617, 0.9), STEEL = mat(0x3b3f44, 0.5, 0.4), STRAP = mat(0x2b2c28, 0.95);

// Materials for one outfit. Also used for the sleeves and gloves in your own view.
export function outfit(team, gear) {
  const T = TEAMC[team], C = CAMO[gear.camo];
  const vest = C ? C.vest : T.v;
  return {
    cloth: C ? camoMat(gear.camo) : mat(T.u), helm: mat(C ? C.helm : T.helm, 0.85), vest: mat(vest, 0.95),
    dark: mat(new THREE.Color(vest).multiplyScalar(0.62).getHex(), 0.95), skin: mat(SKIN[gear.skin], 0.75),
    glove: GLOVE[gear.gloves] ? mat(GLOVE[gear.gloves], 0.9) : mat(SKIN[gear.skin], 0.75), boot: mat(BOOT[gear.boots], 0.75),
    band: mat(T.band, 0.7, 0, { emissive: T.band, emissiveIntensity: 0.25 }), hair: mat(0x2a1d14, 1),
  };
}

const head = {   // head group: neck at y 0, eyes at y 0.13, looking to -z
  dome(h, M, part_ = 0.52, r = 0.152) { const d = part(h, ballG(r, part_, 22), M.helm, 0, 0.15, 0.01); d.scale.set(1, 1.02, 1.16); },
  band(h, M, y = 0.19, r = 0.154) { const b = part(h, cylG(r, r, 0.028, 22, true), M.band, 0, y, 0.01); b.scale.z = 1.16; },
  strap(h) { for (const s of [-1, 1]) { limb(h, [s * 0.122, 0.16, 0.0], [s * 0.05, 0.0, -0.06], 0.008, STRAP); } box(h, 0.08, 0.02, 0.03, 0, -0.005, -0.075, STRAP, 0.006); },
  rails(h) { for (const s of [-1, 1]) box(h, 0.012, 0.028, 0.16, s * 0.153, 0.175, 0.02, STEEL); box(h, 0.05, 0.05, 0.016, 0, 0.245, -0.138, STEEL, 0.004, -0.35); },
  ears(h, M) { for (const s of [-1, 1]) { const e = part(h, cylG(0.048, 0.052, 0.04), M.dark, s * 0.128, 0.125, 0.015, 0, 0, Math.PI / 2); e.scale.x = 1.2; } limb(h, [-0.13, 0.1, -0.02], [-0.05, 0.045, -0.125], 0.006, BLACK); box(h, 0.035, 0.018, 0.018, -0.04, 0.045, -0.13, BLACK, 0.005); },
};
const HELMET = {
  combat(h, M) { head.dome(h, M); const r = part(h, cylG(0.158, 0.166, 0.022, 22), M.helm, 0, 0.152, 0.005); r.scale.z = 1.18; head.band(h, M, 0.185); head.strap(h); box(h, 0.06, 0.03, 0.02, 0, 0.215, -0.165, M.dark, 0.006); },
  highcut(h, M) { head.dome(h, M, 0.48); head.rails(h); head.ears(h, M); head.band(h, M, 0.2, 0.153); head.strap(h); box(h, 0.07, 0.05, 0.03, 0, 0.24, 0.165, M.dark, 0.01); },
  nvg(h, M) {
    HELMET.highcut(h, M);
    box(h, 0.05, 0.03, 0.06, 0, 0.275, -0.165, STEEL, 0.006);
    for (const s of [-1, 1]) { part(h, cylG(0.024, 0.028, 0.1), BLACK, s * 0.036, 0.3, -0.205, 1.0); part(h, cylG(0.02, 0.02, 0.008), mat(0x6fffa0, 0.3, 0, { emissive: 0x2fd070, emissiveIntensity: 0.8 }), s * 0.036, 0.272, -0.249, 1.0); }
  },
  assault(h, M) {
    head.dome(h, M, 0.56, 0.158); head.band(h, M, 0.2, 0.161); head.strap(h);
    const v = part(h, cylG(0.168, 0.168, 0.15, 20, true, Math.PI - 1.05, 2.1), mat(0x9fc4d4, 0.15, 0.1, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), 0, 0.1, 0.0);
    v.scale.z = 1.1;
    box(h, 0.27, 0.02, 0.03, 0, 0.178, -0.15, STEEL, 0.006);
    for (const s of [-1, 1]) part(h, cylG(0.03, 0.03, 0.025), STEEL, s * 0.16, 0.17, -0.02, 0, 0, Math.PI / 2);
  },
  crew(h, M) {
    head.dome(h, M, 0.49, 0.156); head.band(h, M, 0.2, 0.157);
    for (const s of [-1, 1]) { const e = part(h, ballG(0.07), M.dark, s * 0.118, 0.11, 0.01); e.scale.set(0.6, 1, 1); }
    limb(h, [0.13, 0.09, -0.03], [0.03, 0.04, -0.13], 0.007, BLACK);
    box(h, 0.21, 0.06, 0.04, 0, 0.245, -0.145, BLACK, 0.015, -0.45); box(h, 0.17, 0.035, 0.02, 0, 0.25, -0.168, mat(0x2b4a55, 0.15, 0.3), 0.008, -0.45);
  },
  boonie(h, M) { const c = part(h, cylG(0.118, 0.135, 0.11, 20), M.cloth, 0, 0.225, 0.01); c.scale.z = 1.1; const b = part(h, cylG(0.21, 0.225, 0.016, 24), M.cloth, 0, 0.172, 0.0, -0.06); b.scale.z = 1.08; head.band(h, M, 0.192, 0.137); },
  beret(h, M) { const b = part(h, ballG(0.15, 1, 20), M.helm, 0.025, 0.215, 0.015, 0, 0, -0.18); b.scale.set(1.05, 0.42, 1.12); head.band(h, M, 0.172, 0.126); part(h, cylG(0.02, 0.02, 0.008), mat(0xd8b45a, 0.4, 0.7), -0.07, 0.225, -0.135, Math.PI / 2 - 0.2); },
  cap(h, M) { const c = part(h, cylG(0.12, 0.13, 0.085, 20), M.cloth, 0, 0.215, 0.01); c.scale.z = 1.12; box(h, 0.17, 0.014, 0.11, 0, 0.178, -0.17, M.cloth, 0.006, 0.18); head.band(h, M, 0.188, 0.132); },
  none(h, M) { const d = part(h, ballG(0.124, 0.5, 20), M.hair, 0, 0.145, 0.012); d.scale.set(1, 1.02, 1.08); head.band(h, M, 0.178, 0.124); },
};
const FACE = {
  none() {},
  goggles(h, M) { box(h, 0.19, 0.075, 0.05, 0, 0.135, -0.1, BLACK, 0.02); box(h, 0.16, 0.05, 0.02, 0, 0.135, -0.122, mat(0xc9852e, 0.15, 0.3), 0.009); const s = part(h, cylG(0.122, 0.122, 0.03, 20, true), STRAP, 0, 0.14, 0.005); s.scale.z = 1.05; },
  shades(h) { for (const s of [-1, 1]) { box(h, 0.07, 0.04, 0.014, s * 0.042, 0.135, -0.114, mat(0x16181b, 0.15, 0.4), 0.006, 0, s * -0.25); limb(h, [s * 0.078, 0.145, -0.1], [s * 0.112, 0.14, 0.0], 0.005, BLACK); } box(h, 0.03, 0.01, 0.01, 0, 0.145, -0.118, BLACK); },
  balaclava(h) { const b = part(h, ballG(0.117, 1, 20), BLACK, 0, 0.12, 0); b.scale.set(0.93, 1.12, 1.0); box(h, 0.145, 0.045, 0.03, 0, 0.135, -0.102, null, 0.01); part(h, cylG(0.075, 0.09, 0.08), BLACK, 0, -0.01, 0.01); },
  scarf(h) { const M1 = mat(0xb7a27a, 1), M2 = mat(0x8c7650, 1); const a = part(h, torusG(0.095, 0.042), M1, 0, 0.005, 0.0, Math.PI / 2 - 0.12); a.scale.set(1.05, 1.1, 1); const b = part(h, torusG(0.088, 0.036), M2, 0, 0.05, -0.012, Math.PI / 2 + 0.16); b.scale.set(1, 1.08, 1); box(h, 0.16, 0.16, 0.04, 0.03, -0.1, -0.1, M1, 0.018, -0.25, 0, 0.5); },
  gasmask(h) {
    const b = part(h, ballG(0.112, 1, 20), mat(0x25282a, 0.6), 0, 0.085, -0.025); b.scale.set(0.95, 1.1, 1);
    for (const s of [-1, 1]) { part(h, cylG(0.038, 0.038, 0.02), STEEL, s * 0.05, 0.14, -0.108, Math.PI / 2, 0, s * -0.3); part(h, cylG(0.031, 0.031, 0.024), mat(0x35525c, 0.1, 0.4), s * 0.05, 0.14, -0.11, Math.PI / 2, 0, s * -0.3); }
    part(h, cylG(0.036, 0.042, 0.06), STEEL, 0, 0.04, -0.145, Math.PI / 2 - 0.3); part(h, cylG(0.048, 0.048, 0.04), mat(0x4a5638, 0.8), -0.075, 0.035, -0.125, Math.PI / 2, 0, 0.7);
  },
  paint(h) { const g = mat(0x2f3a22, 0.95), k = mat(0x1b1f16, 0.95); for (const [x, y, a, m] of [[-0.055, 0.1, 0.5, g], [0.055, 0.085, 0.5, k], [-0.04, 0.06, 0.5, k], [0.03, 0.165, 0.4, g], [0.06, 0.115, 0.5, g], [0, 0.045, 0.3, g]]) { const s = box(h, 0.07, 0.016, 0.014, x, y, -0.1 + Math.abs(x) * 0.3, m, 0.005, 0, x * -4, a); s.position.z -= 0.004; } },
};
const pouch = (t, M, x, y, z, w = 0.085, h = 0.13, d = 0.05) => { box(t, w, h, d, x, y, z, M.vest, 0.012); box(t, w * 1.02, h * 0.35, d * 1.08, x, y + h * 0.36, z, M.dark, 0.01); };
const plates = (t, M, w = 0.36) => {
  box(t, w, 0.36, 0.07, 0, 0.38, -0.145, M.vest, 0.025); box(t, w, 0.38, 0.07, 0, 0.38, 0.145, M.vest, 0.025);
  for (const s of [-1, 1]) { box(t, 0.04, 0.16, 0.26, s * 0.2, 0.29, 0, M.dark, 0.012); box(t, 0.07, 0.04, 0.3, s * 0.125, 0.575, 0, M.vest, 0.015); }
  box(t, w * 0.8, 0.09, 0.02, 0, 0.48, -0.185, M.dark, 0.006);
};
const VEST = {
  plate(t, M) { plates(t, M); for (const x of [-0.1, 0, 0.1]) pouch(t, M, x, 0.29, -0.2); box(t, 0.06, 0.05, 0.03, 0.12, 0.49, -0.19, BLACK, 0.006); },
  heavy(t, M) {
    plates(t, M, 0.4);
    const c = part(t, cylG(0.125, 0.15, 0.065, 18, true), mat(M.vest.color.getHex(), 0.95, 0, { side: THREE.DoubleSide }), 0, 0.605, 0.005); c.scale.z = 0.95;
    for (const s of [-1, 1]) { const p = part(t, ballG(0.105, 0.62), M.vest, s * 0.255, 0.49, 0); p.scale.set(0.95, 1.1, 1.05); p.rotation.z = s * -0.35; }
    box(t, 0.2, 0.2, 0.04, 0, -0.04, -0.15, M.vest, 0.018, 0.1); box(t, 0.34, 0.08, 0.04, 0, 0.2, -0.17, M.dark, 0.012);
    for (const x of [-0.11, 0.11]) pouch(t, M, x, 0.3, -0.21, 0.1, 0.14, 0.06); pouch(t, M, 0, 0.3, -0.21, 0.1, 0.14, 0.06);
  },
  rig(t, M) { box(t, 0.4, 0.13, 0.27, 0, 0.27, 0, M.dark, 0.04); for (const x of [-0.15, -0.05, 0.05, 0.15]) pouch(t, M, x, 0.28, -0.165, 0.088, 0.16, 0.06); for (const s of [-1, 1]) { limb(t, [s * 0.12, 0.35, -0.145], [s * 0.1, 0.57, -0.06], 0.02, M.vest); limb(t, [s * 0.1, 0.57, -0.06], [s * -0.06, 0.3, 0.145], 0.02, M.vest); } },
  ghillie(t, M) {
    const A = M.cloth, B = M.helm;
    let s = 3;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 150; i++) {
      const a = r() * 6.283, y = 0.12 + r() * 0.46, k = y > 0.5 ? 0.8 : 1;
      const x = Math.cos(a) * 0.235 * k, z = Math.sin(a) * 0.165 * k;
      box(t, 0.028 + r() * 0.03, 0.12 + r() * 0.14, 0.012, x, y - 0.03, z, i % 3 ? A : i % 2 ? B : M.dark, 0, 0.15 * Math.sin(a), -a + Math.PI / 2, (r() - 0.5) * 0.7);
    }
    for (const q of [-1, 1]) box(t, 0.2, 0.06, 0.26, q * 0.14, 0.58, 0, A, 0.03, 0, 0, q * -0.25);
    box(t, 0.24, 0.1, 0.05, 0, 0.3, -0.18, M.vest, 0.015);
  },
  harness(t, M) { for (const s of [-1, 1]) { limb(t, [s * 0.13, 0.06, -0.13], [s * 0.1, 0.57, -0.07], 0.018, M.dark); limb(t, [s * 0.1, 0.57, -0.07], [s * 0.1, 0.06, 0.14], 0.018, M.dark); pouch(t, M, s * 0.13, 0.12, -0.16, 0.1, 0.12, 0.06); } box(t, 0.12, 0.035, 0.02, 0, 0.42, -0.135, M.dark, 0.006); },
};
const PACK = {
  assault(t, M) { box(t, 0.3, 0.38, 0.14, 0, 0.36, 0.23, M.vest, 0.04); box(t, 0.24, 0.16, 0.06, 0, 0.27, 0.315, M.dark, 0.025); },
  ruck(t, M) { box(t, 0.36, 0.46, 0.2, 0, 0.36, 0.26, M.vest, 0.05); part(t, cylG(0.075, 0.075, 0.42), M.cloth, 0, 0.65, 0.25, 0, 0, Math.PI / 2); for (const s of [-1, 1]) { box(t, 0.07, 0.2, 0.14, s * 0.21, 0.27, 0.26, M.dark, 0.025); part(t, cylG(0.078, 0.078, 0.025), STRAP, s * 0.11, 0.65, 0.25, 0, 0, Math.PI / 2); } box(t, 0.26, 0.17, 0.06, 0, 0.25, 0.37, M.dark, 0.025); },
  radio(t, M) { box(t, 0.28, 0.36, 0.13, 0, 0.36, 0.225, M.vest, 0.03); box(t, 0.2, 0.2, 0.1, 0, 0.47, 0.27, mat(0x3f4632, 0.6, 0.2), 0.015); part(t, cylG(0.007, 0.01, 0.55, 8), BLACK, 0.1, 0.8, 0.27, -0.1); for (const x of [-0.05, 0.0, 0.05]) part(t, cylG(0.014, 0.014, 0.02), BLACK, x, 0.585, 0.27); limb(t, [-0.08, 0.5, 0.28], [-0.2, 0.46, 0.02], 0.007, BLACK); },
  hydro(t, M) { box(t, 0.2, 0.36, 0.08, 0, 0.38, 0.205, M.vest, 0.03); limb(t, [0.08, 0.54, 0.18], [0.12, 0.58, 0.0], 0.008, BLACK); limb(t, [0.12, 0.58, 0], [0.13, 0.46, -0.17], 0.008, BLACK); },
  none() {},
};
const beltPouches = (t, M) => { for (const s of [-1, 1]) { pouch(t, M, s * 0.17, 0.02, -0.1, 0.08, 0.1, 0.06); pouch(t, M, s * 0.2, 0.01, 0.06, 0.07, 0.12, 0.09); } box(t, 0.12, 0.1, 0.06, 0, 0.02, 0.16, M.vest, 0.02); };
const knee = (k, M) => { box(k, 0.14, 0.16, 0.06, 0, 0.0, -0.085, M.dark, 0.025); box(k, 0.1, 0.1, 0.03, 0, 0.0, -0.118, BLACK, 0.014); for (const y of [0.04, -0.05]) box(k, 0.178, 0.024, 0.178, 0, y, 0, STRAP, 0.02); };
const holster = l => { box(l, 0.05, 0.2, 0.1, 0.115, -0.17, 0, BLACK, 0.012); box(l, 0.04, 0.07, 0.045, 0.12, -0.05, 0.02, STEEL, 0.008, -0.3); for (const y of [-0.13, -0.22]) box(l, 0.2, 0.02, 0.2, 0, y, 0, STRAP, 0.02); };

// -> Group with userData { legs, torso, head, aim, gear, team }. Feet at y 0, looking to -z.
export function makeSoldier(team, gearIn, weapon = 'rifle') {
  const gear = cleanGear(gearIn), M = outfit(team, gear), g = new THREE.Group(), u = { team, gear, weapon: '' };
  u.legs = [-1, 1].map(s => {
    const l = new THREE.Group(); l.position.set(s * 0.11, 0.9, 0);
    const th = limb(l, [0, -0.06, 0], [0, -0.4, 0.0], 0.088, M.cloth); th.scale.z = 1.08;
    box(l, 0.05, 0.14, 0.12, s * 0.082, -0.2, 0.01, M.cloth, 0.02);
    const k = new THREE.Group(); k.position.y = -0.45; k.userData.keep = true;
    limb(k, [0, 0, 0], [0, -0.26, 0.01], 0.074, M.cloth);
    limb(k, [0, -0.24, 0.01], [0, -0.36, 0.01], 0.072, M.boot);
    box(k, 0.125, 0.09, 0.27, 0, -0.395, -0.045, M.boot, 0.035); box(k, 0.13, 0.025, 0.285, 0, -0.437, -0.045, BLACK, 0.01);
    if (gear.extra === 'knees' || gear.extra === 'full') knee(k, M);
    if (s === 1 && (gear.extra === 'holster' || gear.extra === 'full')) holster(l);
    bake(k); l.add(k); l.userData.knee = k; bake(l); g.add(l);
    return l;
  });
  const torso = new THREE.Group(); torso.position.y = 0.9; g.add(torso); u.torso = torso;
  box(torso, 0.36, 0.2, 0.23, 0, 0.04, 0, M.cloth, 0.07);
  box(torso, 0.37, 0.34, 0.225, 0, 0.25, 0, M.cloth, 0.07);
  box(torso, 0.42, 0.28, 0.245, 0, 0.43, 0, M.cloth, 0.09);
  box(torso, 0.375, 0.05, 0.245, 0, 0.075, 0, STRAP, 0.02); box(torso, 0.05, 0.04, 0.02, 0, 0.075, -0.125, STEEL, 0.006);
  for (const s of [-1, 1]) part(torso, ballG(0.092), M.cloth, s * 0.215, 0.46, 0);
  part(torso, cylG(0.058, 0.07, 0.12), gear.face === 'balaclava' ? BLACK : M.skin, 0, 0.6, 0.005);
  box(torso, 0.17, 0.045, 0.15, 0, 0.565, 0.005, M.cloth, 0.02);
  VEST[gear.vest](torso, M); PACK[gear.pack](torso, M);
  if (gear.extra === 'pouches' || gear.extra === 'full') beltPouches(torso, M);
  const PZ = { assault: 0.306, ruck: 0.368, radio: 0.3, hydro: 0.252, none: 0.185 }[gear.pack];
  box(torso, 0.13, 0.07, 0.012, 0, gear.pack === 'radio' ? 0.27 : 0.45, gear.vest === 'ghillie' ? Math.max(PZ, 0.26) : PZ, M.band, 0.004);   // team patch on the back
  const h = new THREE.Group(); h.position.y = 0.62; h.userData.keep = true; torso.add(h); u.head = h;
  const sk = part(h, ballG(0.108, 1, 20), M.skin, 0, 0.12, 0); sk.scale.set(0.93, 1.14, 1.02);
  const covered = gear.face === 'balaclava' || gear.face === 'gasmask';
  box(h, 0.115, 0.08, 0.115, 0, 0.045, -0.028, gear.face === 'balaclava' ? BLACK : M.skin, 0.04);
  if (!covered) box(h, 0.03, 0.05, 0.035, 0, 0.105, -0.112, M.skin, 0.012);
  for (const s of [-1, 1]) {
    part(h, ballG(0.012, 1, 10), mat(0xf4f1ea, 0.4), s * 0.038, 0.135, -0.098); part(h, ballG(0.0075, 1, 8), BLACK, s * 0.038, 0.135, -0.107);
    box(h, 0.04, 0.009, 0.012, s * 0.04, 0.157, -0.104, M.hair, 0.003, 0, s * -0.2); part(h, ballG(0.022, 1, 10), M.skin, s * 0.102, 0.115, 0.01);
  }
  if (!covered) box(h, 0.045, 0.008, 0.01, 0, 0.052, -0.088, mat(0x6e3a30, 0.9), 0.003);
  HELMET[gear.helmet](h, M);
  FACE[gear.face](h, M);
  h.traverse(o => { if (o.isMesh && !o.material) o.material = M.skin; });
  if (gear.face === 'balaclava') for (const s of [-1, 1]) { part(h, ballG(0.011, 1, 10), mat(0xf4f1ea, 0.4), s * 0.038, 0.135, -0.112); part(h, ballG(0.0075, 1, 8), BLACK, s * 0.038, 0.135, -0.12); }
  bake(h);
  const aim = new THREE.Group(); aim.position.set(0, 0.5, 0); aim.userData.keep = true; torso.add(aim); u.aim = aim;
  bake(torso);
  g.userData = u;
  setWeapon(g, weapon);
  return g;
}

// Puts a gun in the soldier's hands and poses the arms around it.
export function setWeapon(g, weapon) {
  const u = g.userData;
  if (u.weapon === weapon || !WEAPONS[weapon]) return;
  u.weapon = weapon;
  dispose(u.aim); u.aim.clear();
  const M = outfit(u.team, u.gear), gun = buildGun(weapon, u.gear.finish), side = WEAPONS[weapon].slot === 2;
  const at = side ? [0.03, -0.02, -0.47] : [0.07, -0.07, -0.29];
  gun.g.position.set(...at);
  u.aim.add(gun.g);
  const hand = p => [at[0] + p[0], at[1] + p[1], at[2] + Math.max(p[2], side ? -1 : -0.3)];
  for (const [s, p] of [[1, gun.right], [-1, gun.left]]) {
    const A = [s * 0.225, -0.03, 0.0], H = hand(p), E = [(A[0] + H[0]) / 2 + s * 0.075, (A[1] + H[1]) / 2 - 0.1, (A[2] + H[2]) / 2 + 0.03];
    limb(u.aim, A, E, 0.06, M.cloth); limb(u.aim, E, H, 0.048, M.cloth);
    const d = new THREE.Vector3(E[0] - A[0], E[1] - A[1], E[2] - A[2]).normalize();
    const b = part(u.aim, cylG(0.067, 0.067, 0.07), M.band);   // team arm band
    b.position.set(A[0] + (E[0] - A[0]) * 0.45, A[1] + (E[1] - A[1]) * 0.45, A[2] + (E[2] - A[2]) * 0.45);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    part(u.aim, ballG(0.052), M.glove, ...H).scale.set(0.85, 0.95, 1.1);
  }
  bake(u.aim);
}
export { dispose as disposeSoldier };
