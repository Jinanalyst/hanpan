// HANPAN client: rendering, local movement prediction, interpolation of other players, HUD and audio.
import * as THREE from 'three';
import { getMap, isMap, randomMap, MAP_LIST, DEFAULT_MAP } from './shared/map.js';
import { PHYS, step, dirFrom, hits, rayMap, hitbox } from './shared/physics.js';
import { WEAPONS } from './shared/weapons.js';
import { Room, cleanName } from './shared/game.js';
import { configured, currentUser, maybeSignedIn, signOut, walletOf, shortWallet } from './auth.js';

const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
const nowS = () => performance.now() / 1000;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const V = new THREE.Vector3();
let MAP = getMap(DEFAULT_MAP), BOXES = MAP.boxes;   // the land being shown or played; set by loadMap()

/* ---------------- renderer + world ---------------- */
const canvas = $('c');
const R = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
R.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
R.shadowMap.enabled = true;
R.shadowMap.type = THREE.PCFSoftShadowMap;
R.autoClear = false;
R.toneMapping = THREE.ACESFilmicToneMapping;
R.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9d3dc, 70, 260);
const cam = new THREE.PerspectiveCamera(78, 1, 0.05, 700);
cam.rotation.order = 'YXZ';
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);

const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(sky.geometry.attributes.position.count * 3), 3));
scene.add(sky);
function paintSky(topC, horC) {
  const p = sky.geometry.attributes.position, col = sky.geometry.attributes.color, top = new THREE.Color(topC), hor = new THREE.Color(horC), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.copy(hor).lerp(top, Math.pow(Math.max(0, p.getY(i) / 500), 0.55)); col.setXYZ(i, c.r, c.g, c.b); }
  col.needsUpdate = true;
}
const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x6b5a40, 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.8);
sun.position.set(35, 60, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -56, right: 56, top: 56, bottom: -56, near: 1, far: 180 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
const flashLight = new THREE.PointLight(0xffc070, 0, 8, 2);
scene.add(flashLight);
const vmHemi = new THREE.HemisphereLight(0xffffff, 0x554433, 2.2), vmSun = new THREE.DirectionalLight(0xfff0d8, 2.2);
vmSun.position.set(1, 2, 1); vmScene.add(vmHemi, vmSun);
const vmFlashLight = new THREE.PointLight(0xffb050, 0, 2);
vmScene.add(vmFlashLight);

// procedural textures
function ctex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function speck(g, w, h, n, cols, smax = 3) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.random() * cols.length | 0]; g.globalAlpha = Math.random() * 0.5 + 0.2;
    const s = Math.random() * smax + 1; g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 1;
}
const T = {
  concrete: ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#9b9a93'; g.fillRect(0, 0, w, h);
    speck(g, w, h, 5000, ['#8a8a85', '#a8a8a2', '#7c7c77'], 2);
    g.strokeStyle = 'rgba(60,60,55,.35)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    const gr = g.createLinearGradient(0, h * 0.7, 0, h); gr.addColorStop(0, 'rgba(70,60,45,0)'); gr.addColorStop(1, 'rgba(70,60,45,.35)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }),
  crate: ctex(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 32) { g.fillStyle = `hsl(32,38%,${30 + Math.random() * 10}%)`; g.fillRect(0, y, w, 31); }
    speck(g, w, h, 1500, ['#6e5230', '#9c7a4a'], 2);
    g.strokeStyle = '#4e3a20'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18);
    g.beginPath(); g.moveTo(18, 18); g.lineTo(w - 18, h - 18); g.stroke();
  }),
  sandbag: ctex(256, 128, (g, w, h) => {
    g.fillStyle = '#5f5644'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let i = -1; i < 5; i++) {
      g.fillStyle = `hsl(42,${22 + Math.random() * 8}%,${50 + Math.random() * 8}%)`;
      g.beginPath(); g.roundRect(i * 64 + (r % 2) * 32 + 2, r * 32 + 2, 60, 28, 12); g.fill();
    }
    speck(g, w, h, 800, ['#5a523f'], 2);
  }),
  barrier: ctex(256, 128, (g, w, h) => {
    g.fillStyle = '#a3a29a'; g.fillRect(0, 0, w, h); speck(g, w, h, 2500, ['#8a8a85', '#b5b5ad'], 2);
    for (let x = -h; x < w; x += 32) { g.fillStyle = '#e0b52a'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + 24, h - 24); g.lineTo(x + 24, h - 24); g.fill(); }
  }),
  metal: ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#8b9197'; g.fillRect(0, 0, w, h); speck(g, w, h, 2500, ['#7c8288', '#9aa0a6', '#8a7364'], 2);
    g.strokeStyle = 'rgba(40,45,50,.45)'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
    g.fillStyle = 'rgba(40,45,50,.5)'; for (const x of [14, w - 14]) for (let y = 14; y < h; y += 38) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  }),
  panel: ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9d2d8'; g.fillRect(0, 0, w, h); speck(g, w, h, 1800, ['#bcc6cd', '#d7dee3'], 2);
    g.fillStyle = '#b4532f'; g.fillRect(0, h * 0.62, w, 22);
    g.strokeStyle = 'rgba(60,75,85,.45)'; g.lineWidth = 3; for (let x = 0; x < w; x += 64) g.strokeRect(x, 1, 64, h - 2);
  }),
  brick: ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#4d4643'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 16; r++) for (let i = -1; i < 8; i++) { g.fillStyle = `hsl(${12 + Math.random() * 10},${24 + Math.random() * 10}%,${32 + Math.random() * 9}%)`; g.fillRect(i * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14); }
  }),
  stone: ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#6f6d5c'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let i = -1; i < 3; i++) { g.fillStyle = `hsl(52,${9 + Math.random() * 6}%,${50 + Math.random() * 10}%)`; g.fillRect(i * 128 + (r % 2) * 64 + 2, r * 64 + 2, 124, 60); }
    speck(g, w, h, 2600, ['#7f7d6a', '#a09d88', '#66753f', '#5c6b3a'], 3);
  }),
  rock: ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#7b7c7c'; g.fillRect(0, 0, w, h); speck(g, w, h, 6000, ['#6b6c6d', '#8c8d8d', '#5c5d5f', '#999a99'], 7);
  }),
  snow: ctex(128, 128, (g, w, h) => { g.fillStyle = '#eef3f7'; g.fillRect(0, 0, w, h); speck(g, w, h, 900, ['#dbe4ec', '#ffffff', '#cfdae4'], 4); }),
  wood: ctex(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 32) { g.fillStyle = `hsl(28,30%,${27 + Math.random() * 9}%)`; g.fillRect(0, y, w, 31); }
    speck(g, w, h, 1500, ['#4d3a26', '#7d6243'], 3);
  }),
  cloth: ctex(128, 128, (g, w, h) => { for (let x = 0; x < w; x += 32) { g.fillStyle = x % 64 ? '#e8dcc2' : '#b23a2e'; g.fillRect(x, 0, 32, h); } }),
};
const groundTex = ([base, ...specks]) => ctex(512, 512, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  speck(g, w, h, 9000, specks, 3);
  g.fillStyle = specks[2]; g.globalAlpha = 0.14;
  for (let i = 0; i < 40; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rnd(20, 60), rnd(10, 30), Math.random() * 3, 0, 7); g.fill(); }
  g.globalAlpha = 1;
});
const containerTex = col => ctex(256, 256, (g, w, h) => {
  g.fillStyle = col; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, 0, 5, h); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 7, 0, 3, h); }
  speck(g, w, h, 600, ['rgba(90,50,30,.6)', 'rgba(40,30,20,.5)'], 4);
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 8; g.strokeRect(0, 0, w, h);
});
const std = o => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, ...o });
const MAT = {
  crate: std({ map: T.crate }),
  metal: std({ map: T.metal, roughness: 0.6, metalness: 0.3 }), panel: std({ map: T.panel, roughness: 0.7 }), brick: std({ map: T.brick }), stone: std({ map: T.stone }),
  rock: std({ map: T.rock }), snow: std({ map: T.snow }), wood: std({ map: T.wood }), cloth: std({ map: T.cloth }), tree: std({ map: T.wood }), leaf: std({ color: 0x3f6b2e }),
  neonM: new THREE.MeshBasicMaterial({ color: 0xff5fb4 }), neonC: new THREE.MeshBasicMaterial({ color: 0x5fe3ff }), neonY: new THREE.MeshBasicMaterial({ color: 0xffd75a }),
  sandbag: std({ map: T.sandbag }), barrier: std({ map: T.barrier }), barrel: std({ color: 0x46603d, roughness: 0.55, metalness: 0.35 }),
};
const CONT = ['#8c3b2a', '#2f5d7c', '#4c6b3a'].map(c => std({ map: containerTex(c), roughness: 0.7, metalness: 0.2 }));

function boxGeo(w, h, d, s) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / s, uv.getY(k) * dims[f][1] / s); }
  return g;
}
const TEXM = { container: 3, sandbag: 2, barrier: 4, snow: 4, rock: 4, stone: 4, cloth: 1.5 };   // meters per texture repeat
function buildWorld(map) {
  const g = new THREE.Group(), th = map.theme;
  const wall = std({ map: T.concrete, color: th.wall }), perim = std({ map: T.concrete, color: th.perimeter });
  let ci = 0;
  for (const b of map.boxes) {
    const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
    const x = (b.min[0] + b.max[0]) / 2, z = (b.min[2] + b.max[2]) / 2;
    let m;
    if (b.kind === 'barrel') m = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 18), MAT.barrel);
    else if (b.kind === 'tree') {
      m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.4, w * 0.5, h, 10), MAT.tree);
      for (const [y, r] of [[h - 1.2, 2.4], [h + 0.4, 1.9], [h + 1.8, 1.2]]) {   // leaves are only for looks and sit above head height
        const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), MAT.leaf);
        l.scale.y = 0.6; l.position.set(x, y, z); l.castShadow = true; g.add(l);
      }
    } else {
      const mat = b.kind === 'container' ? CONT[ci++ % 3] : b.kind === 'wall' ? wall : b.kind === 'perimeter' ? perim : MAT[b.kind] || wall;
      m = new THREE.Mesh(boxGeo(w, h, d, b.kind === 'crate' ? Math.max(w, h, d) : TEXM[b.kind] || 3), mat);
    }
    m.position.set(x, (b.min[1] + b.max[1]) / 2, z);
    m.castShadow = m.receiveShadow = !b.kind.startsWith('neon');
    g.add(m);
  }
  const gt = groundTex(th.ground); gt.repeat.set(65, 65);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), std({ map: gt }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
  const [shape, farC] = th.far, far = std({ map: T.concrete, color: farC }), lit = [MAT.neonM, MAT.neonC, MAT.neonY];
  for (let i = 0; i < 34; i++) { // distant structures for depth
    const a = i / 34 * Math.PI * 2 + rnd(-0.05, 0.05), r = rnd(78, 140), w = rnd(8, 22), h = shape === 'tower' ? rnd(14, 42) : rnd(5, 18);
    const m = shape === 'peak' ? new THREE.Mesh(new THREE.ConeGeometry(w * 1.1, h * 1.6, 7), far) : new THREE.Mesh(boxGeo(w, h, rnd(8, 20), 4), far);
    m.position.set(Math.cos(a) * r, shape === 'peak' ? h * 0.8 : h / 2, Math.sin(a) * r); m.rotation.y = rnd(0, 3); g.add(m);
    if (shape === 'tower') {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.8, 1), lit[i % 3]);
      s.position.set(m.position.x * 0.88, h * rnd(0.4, 0.8), m.position.z * 0.88); s.lookAt(0, s.position.y, 0); g.add(s);
    }
  }
  for (const [x, y, z, c] of map.lights) { const l = new THREE.PointLight(c, 45, 18, 1.8); l.position.set(x, y, z); g.add(l); }
  return g;
}
// falling snow, kept around the camera
const SNOW_R = 22;
const snow = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from({ length: 1400 * 3 }, () => rnd(-SNOW_R, SNOW_R)), 3)),
  new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false }));
snow.frustumCulled = false; snow.visible = false; scene.add(snow);
function updateSnow(dt) {
  if (!MAP.theme.snow) return;
  const c = [cam.position.x, cam.position.y, cam.position.z];
  // no snow under roofs
  snow.visible = !BOXES.some(b => b.max[0] - b.min[0] > 6 && b.min[1] > c[1] && c[0] > b.min[0] && c[0] < b.max[0] && c[2] > b.min[2] && c[2] < b.max[2]);
  const p = snow.geometry.attributes.position, a = p.array, span = SNOW_R * 2;
  for (let i = 0; i < a.length; i += 3) {
    a[i] += dt * 0.6; a[i + 1] -= dt * 2.2;
    for (let k = 0; k < 3; k++) a[i + k] = c[k] + ((a[i + k] - c[k] + SNOW_R) % span + span) % span - SNOW_R;   // wrap around the camera
  }
  p.needsUpdate = true;
}
const worlds = {};
let world = null;
function loadMap(id) {
  const next = getMap(id);
  if (world && next === MAP) return;
  MAP = next; BOXES = MAP.boxes;
  if (world) world.visible = false;
  if (!worlds[MAP.id]) { worlds[MAP.id] = buildWorld(MAP); scene.add(worlds[MAP.id]); }
  world = worlds[MAP.id]; world.visible = true;
  const th = MAP.theme;
  paintSky(th.skyTop, th.skyHor);
  scene.fog.color.set(th.fog[0]); scene.fog.near = th.fog[1]; scene.fog.far = th.fog[2];
  hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2];
  sun.color.set(th.sun[0]); sun.intensity = th.sun[1]; sun.position.set(...th.sun[2]);
  vmHemi.intensity = vmSun.intensity = 2.2 * th.vm;
  snow.visible = !!th.snow;
  for (const m of [...tracers, ...decals, ...puffs]) m.visible = false;
}

/* ---------------- soldiers ---------------- */
const TEAMC = {
  red: { u: 0xb59a6a, v: 0x6e5c40, band: 0xc0392b, helm: 0x8a7550 },
  blue: { u: 0x5b6b43, v: 0x3e4832, band: 0x2f6fd0, helm: 0x4f5a3a },
};
const matCache = {};
const sm = (c, r = 0.9, m = 0) => matCache[c + ':' + r] || (matCache[c + ':' + r] = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
function addBox(par, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; par.add(m); return m;
}
function makeSoldier(team) {
  const C = TEAMC[team], g = new THREE.Group(), u = {};
  u.legs = [-1, 1].map(s => {
    const l = new THREE.Group(); l.position.set(s * 0.11, 0.9, 0);
    addBox(l, 0.17, 0.46, 0.19, 0, -0.23, 0, sm(C.u));
    const knee = new THREE.Group(); knee.position.y = -0.45;
    addBox(knee, 0.16, 0.4, 0.18, 0, -0.2, 0, sm(C.u)); addBox(knee, 0.18, 0.1, 0.28, 0, -0.41, -0.04, sm(0x2a2420));
    l.add(knee); l.userData.knee = knee; g.add(l); return l;
  });
  const torso = new THREE.Group(); torso.position.y = 0.9; g.add(torso); u.torso = torso;
  addBox(torso, 0.4, 0.56, 0.24, 0, 0.3, 0, sm(C.u));
  addBox(torso, 0.44, 0.42, 0.3, 0, 0.34, 0, sm(C.v));
  addBox(torso, 0.34, 0.12, 0.08, 0, 0.2, -0.18, sm(C.v));
  addBox(torso, 0.3, 0.34, 0.12, 0, 0.36, 0.2, sm(C.v)); // pack
  const head = new THREE.Group(); head.position.y = 0.62; torso.add(head); u.head = head;
  addBox(head, 0.21, 0.24, 0.23, 0, 0.12, 0, sm(0xc99a73));
  addBox(head, 0.28, 0.14, 0.3, 0, 0.27, 0, sm(C.helm));
  addBox(head, 0.3, 0.04, 0.33, 0, 0.21, 0, sm(C.helm));
  addBox(head, 0.18, 0.05, 0.02, 0, 0.15, -0.12, sm(0x1c1c1c, 0.4));
  const aim = new THREE.Group(); aim.position.set(0, 0.5, 0); torso.add(aim); u.aim = aim;
  addBox(aim, 0.12, 0.12, 0.36, 0.22, -0.07, -0.16, sm(C.u));
  addBox(aim, 0.13, 0.13, 0.08, 0.22, -0.07, -0.02, sm(C.band));
  addBox(aim, 0.11, 0.11, 0.3, 0.12, -0.1, -0.42, sm(C.u));
  addBox(aim, 0.12, 0.12, 0.46, -0.18, -0.06, -0.3, sm(C.u));
  addBox(aim, 0.06, 0.09, 0.72, 0.05, -0.04, -0.58, sm(0x1d1f21, 0.5, 0.5));
  addBox(aim, 0.05, 0.14, 0.07, 0.05, -0.14, -0.52, sm(0x1d1f21, 0.5, 0.5));
  g.userData = u;
  return g;
}
function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const g = c.getContext('2d'); g.font = '700 30px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(text, 128, 24); g.fillStyle = color; g.fillText(text, 128, 24);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.3, 1); s.position.y = 2.15; return s;
}

/* ---------------- viewmodel ---------------- */
const vmMat = (c, r = 0.55, m = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const METAL = vmMat(0x3b3f44, 0.5, 0.35), POLY = vmMat(0x34363a, 0.8, 0.05), GLOVE = vmMat(0x3a342c, 0.9, 0);
function vp(g, w, h, d, x, y, z, mat, rx = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; }
function vcyl(g, r, l, x, y, z, mat) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 14), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m; }
function vmArms(g, team, left, right) {
  const sleeve = vmMat(TEAMC[team].u, 0.95, 0);
  for (const [p, s] of [[right, 1], [left, -1]]) {
    vp(g, 0.06, 0.07, 0.1, p[0], p[1], p[2], GLOVE);
    const arm = vp(g, 0.08, 0.08, 0.5, p[0] + s * 0.06, p[1] - 0.09, p[2] + 0.27, sleeve, 0.32);
    arm.rotation.y = s * 0.12;
  }
}
function buildRifle(team) {
  const g = new THREE.Group();
  vp(g, 0.07, 0.09, 0.42, 0, 0, 0, METAL); vp(g, 0.075, 0.08, 0.3, 0, -0.005, -0.35, POLY);
  vcyl(g, 0.013, 0.24, 0, 0.008, -0.6, METAL); vp(g, 0.03, 0.03, 0.06, 0, 0.008, -0.74, METAL);
  vp(g, 0.05, 0.17, 0.08, 0, -0.12, -0.07, METAL, 0.18); vp(g, 0.04, 0.12, 0.05, 0, -0.09, 0.12, POLY, -0.35);
  vp(g, 0.055, 0.085, 0.22, 0, -0.015, 0.31, POLY);
  vp(g, 0.03, 0.02, 0.3, 0, 0.055, -0.12, METAL);
  // open red-dot frame so the world stays visible when aiming
  const sy = 0.09;
  vp(g, 0.054, 0.008, 0.06, 0, sy + 0.025, -0.02, METAL); vp(g, 0.054, 0.008, 0.06, 0, sy - 0.025, -0.02, METAL);
  vp(g, 0.008, 0.058, 0.06, -0.025, sy, -0.02, METAL); vp(g, 0.008, 0.058, 0.06, 0.025, sy, -0.02, METAL);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 12), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  dot.position.set(0, sy, -0.04); g.add(dot);
  vmArms(g, team, [0, -0.05, -0.36], [0, -0.1, 0.1]);
  return { g, muzzle: new THREE.Vector3(0, 0.008, -0.78), hip: new THREE.Vector3(0.17, -0.16, -0.42), ads: new THREE.Vector3(0, -0.09, -0.3) };
}
function buildSniper(team) {
  const g = new THREE.Group();
  vp(g, 0.07, 0.09, 0.5, 0, 0, 0, METAL); vp(g, 0.08, 0.07, 0.3, 0, -0.01, -0.38, vmMat(0x3d4a2f, 0.8, 0.1));
  vcyl(g, 0.015, 0.5, 0, 0.01, -0.75, METAL); vp(g, 0.035, 0.035, 0.08, 0, 0.01, -1.02, METAL);
  vcyl(g, 0.028, 0.32, 0, 0.095, -0.06, METAL); vcyl(g, 0.034, 0.05, 0, 0.095, -0.22, METAL); vcyl(g, 0.034, 0.05, 0, 0.095, 0.1, METAL);
  vp(g, 0.05, 0.1, 0.06, 0, -0.1, -0.05, METAL); vp(g, 0.04, 0.12, 0.05, 0, -0.09, 0.15, POLY, -0.35);
  vp(g, 0.06, 0.11, 0.26, 0, -0.03, 0.36, vmMat(0x3d4a2f, 0.8, 0.1));
  vmArms(g, team, [0, -0.06, -0.38], [0, -0.1, 0.13]);
  return { g, muzzle: new THREE.Vector3(0, 0.01, -1.07), hip: new THREE.Vector3(0.17, -0.17, -0.45), ads: new THREE.Vector3(0, -0.095, -0.28) };
}
function buildPistol(team) {
  const g = new THREE.Group();
  vp(g, 0.04, 0.045, 0.21, 0, 0.035, -0.05, METAL); vp(g, 0.037, 0.03, 0.17, 0, 0.005, -0.04, POLY);
  vp(g, 0.035, 0.11, 0.05, 0, -0.06, 0.04, POLY, -0.25); vp(g, 0.006, 0.012, 0.006, 0, 0.063, -0.15, METAL);
  vp(g, 0.014, 0.012, 0.006, 0, 0.063, 0.05, METAL);
  vmArms(g, team, [-0.03, -0.07, 0.03], [0.01, -0.07, 0.05]);
  return { g, muzzle: new THREE.Vector3(0, 0.035, -0.17), hip: new THREE.Vector3(0.14, -0.15, -0.36), ads: new THREE.Vector3(0, -0.063, -0.34) };
}
const flashTex = ctex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,190,80,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,240,200,.9)'; for (let i = 0; i < 6; i++) { g.save(); g.translate(32, 32); g.rotate(i * Math.PI / 3); g.fillRect(-1.5, 0, 3, 30); g.restore(); }
});
const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
muzzle.visible = false;
let VMS = {}, vmTeam = '';
const vmRoot = new THREE.Group(); vmScene.add(vmRoot);
function buildVM(team) {
  if (team === vmTeam) return;
  vmTeam = team;
  vmRoot.clear();
  VMS = { rifle: buildRifle(team), sniper: buildSniper(team), pistol: buildPistol(team) };
  for (const k in VMS) { VMS[k].g.visible = false; vmRoot.add(VMS[k].g); }
  vmRoot.add(muzzle);
}

/* ---------------- effects ---------------- */
const tracers = [...Array(40)].map(() => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.visible = false; m.userData.t = 0; scene.add(m); return m;
});
let tracerI = 0;
function tracer(a, b) {
  const m = tracers[tracerI++ % tracers.length], len = a.distanceTo(b);
  if (len < 1) return;
  m.position.copy(a).lerp(b, 0.5); m.lookAt(b); m.scale.set(1, 1, len); m.visible = true; m.userData.t = 0.07; m.material.opacity = 0.55;
}
const decalTex = ctex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(15,12,10,1)'); gr.addColorStop(0.35, 'rgba(30,25,20,.85)'); gr.addColorStop(1, 'rgba(40,35,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const decals = [...Array(80)].map(() => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.visible = false; scene.add(m); return m;
});
let decalI = 0;
const puffTex = ctex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const puffs = [...Array(40)].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false })); s.visible = false; s.userData = { t: 0, m: 1 }; scene.add(s); return s; });
let puffI = 0;
function puff(p, color, size = 0.5, life = 0.5) {
  const s = puffs[puffI++ % puffs.length];
  s.position.copy(p); s.material.color.set(color); s.scale.setScalar(size); s.visible = true; s.userData = { t: life, m: life, s: size };
}
function impact(p, n, color = 0xb9a68a) {
  puff(p, color, 0.35, 0.45);
  if (!n || (!n[0] && !n[1] && !n[2])) return;
  const d = decals[decalI++ % decals.length];
  d.position.set(p.x + n[0] * 0.01, p.y + n[1] * 0.01, p.z + n[2] * 0.01);
  d.lookAt(p.x + n[0], p.y + n[1], p.z + n[2]); d.rotation.z = Math.random() * 6; d.visible = true;
}
function updateFx(dt) {
  for (const m of tracers) if (m.visible) { m.userData.t -= dt; m.material.opacity = Math.max(0, m.userData.t / 0.07) * 0.55; if (m.userData.t <= 0) m.visible = false; }
  for (const s of puffs) if (s.visible) {
    const u = s.userData; u.t -= dt; const k = u.t / u.m;
    s.material.opacity = Math.max(0, k * 0.8); s.scale.setScalar(u.s * (1 + (1 - k) * 1.5)); s.position.y += dt * 0.3;
    if (u.t <= 0) s.visible = false;
  }
}

/* ---------------- audio ---------------- */
let AC = null, master = null, nbuf = null;
function audio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.7; master.connect(AC.destination);
    nbuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { AC = null; }
}
function shotSfx(w, dist = 0, pan = 0) {
  if (!AC) return;
  const t = AC.currentTime, v = 1 / (1 + dist * 0.06), P = AC.createStereoPanner();
  P.pan.value = clamp(pan, -1, 1); P.connect(master);
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = (w === 'sniper' ? 2600 : w === 'pistol' ? 4200 : 3400) / (1 + dist * 0.03);
  const s = AC.createBufferSource(); s.buffer = nbuf;
  const g = AC.createGain(), dur = w === 'sniper' ? 0.55 : 0.18;
  g.gain.setValueAtTime(0.55 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(lp).connect(g).connect(P); s.start(t, Math.random() * 0.4); s.stop(t + dur);
  const o = AC.createOscillator(), og = AC.createGain();
  o.frequency.setValueAtTime(w === 'sniper' ? 110 : 150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  og.gain.setValueAtTime(0.7 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(og).connect(P); o.start(t); o.stop(t + 0.16);
}
function blip(f, d, v = 0.1, type = 'square', at = 0) {
  if (!AC) return;
  const t = AC.currentTime + at, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.01);
}
function noiseSfx(d, f, v, at = 0) {
  if (!AC) return;
  const t = AC.currentTime + at, s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = nbuf; fl.type = 'bandpass'; fl.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  s.connect(fl).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + d);
}

/* ---------------- game state ---------------- */
let net = null, inGame = false, myId = 0, myTeam = 'red', roster = new Map(), snaps = [], offEst = null;
const me = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ground: true, cr: false, yaw: 0, pitch: 0 };
let sp = 0, srv = { hp: 100, a: 30, r: 150, w: 'rifle', al: 1, rs: 0, rl: 0, pg: 0, pr: 0 }, score = [0, 0], timeLeft = 600, phase = 'play';
let lo = store.get('hanpan-lo', 'rifle') === 'sniper' ? 'sniper' : 'rifle', cur = lo, switchT = 0;
let sens = +store.get('hanpan-sens', 1.2) || 1.2;
let eyeH = PHYS.eye, adsT = 0, bloom = 0, recoilDebt = 0, nextFire = 0, trigger = false, latch = false, ads = false;
let reloadT = 0, reloadDur = 1, shotTimes = [], deathAt = null, killer = 0, wasAlive = true, stepAcc = 0, inputAcc = 0, lastHurt = 0;
let kick = { z: 0, r: 0 }, sway = { x: 0, y: 0 }, bobT = 0, lockFailed = false;
const others = new Map();
const K = {};

function send(m) { if (net) net.send(m); }

function onMsg(m) {
  switch (m.t) {
    case 'welcome': loadMap(m.map); myId = m.id; myTeam = m.team; buildVM(myTeam); break;
    case 'tp': Object.assign(me, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: 0, vx: 0, vy: 0, vz: 0 }); sp = m.sp; break;
    case 's': onSnap(m); break;
    case 'ro': {
      roster = new Map(m.ps.map(p => [p.id, p]));
      const mine = roster.get(myId);
      if (mine && mine.tm !== myTeam) { myTeam = mine.tm; buildVM(myTeam); }
      if (!$('board').hidden) renderBoard();
      break;
    }
    case 'sh': remoteShot(m); break;
    case 'hit': showHit(m); break;
    case 'dmg': showDmg(m); break;
    case 'k': onKill(m); break;
    case 'rl': reloadT = reloadDur = m.d; noiseSfx(0.06, 2500, 0.15, 0.1); noiseSfx(0.08, 1800, 0.18, m.d * 0.7); break;
    case 'end': showEnd(m); break;
    case 'start': setText('center', ''); break;
    case 'pi': send({ t: 'po', s: m.s }); break;
  }
}

function onSnap(m) {
  const lt = nowS(), off = m.ts - lt;
  offEst = offEst == null ? off : offEst + (off - offEst) * 0.05;
  const map = new Map();
  for (const a of m.ps) map.set(a[0], a);
  snaps.push({ ts: m.ts, map });
  if (snaps.length > 40) snaps.shift();
  srv = m.me; score = m.sc; timeLeft = m.tl; phase = m.ph;
  if (srv.al && !wasAlive) { deathAt = null; setText('center', ''); }
  wasAlive = !!srv.al;
  if (srv.w !== cur && nowS() - switchT > 0.6) cur = srv.w;
  for (const a of m.ps) {
    if (a[0] === myId) continue;
    const team = a[9] ? 'blue' : 'red';
    let o = others.get(a[0]);
    if (o && o.team !== team) { scene.remove(o.g); o = null; }
    if (!o) {
      const g = makeSoldier(team);
      o = { g, team, walk: 0, px: a[1], pz: a[3], tag: null, dead: 0, s: { x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], cr: a[6], alive: a[7] } };
      scene.add(g); others.set(a[0], o);
    }
  }
  for (const [id, o] of others) if (!map.has(id)) { scene.remove(o.g); others.delete(id); }
}

function interpRemotes(dt) {
  if (snaps.length < 2 || offEst == null) return;
  const rt = nowS() + offEst - 0.1;
  let a = snaps[0], b = snaps[snaps.length - 1];
  for (let i = snaps.length - 1; i > 0; i--) if (snaps[i - 1].ts <= rt) { a = snaps[i - 1]; b = snaps[i]; break; }
  const k = clamp((rt - a.ts) / ((b.ts - a.ts) || 1), 0, 1.2);
  for (const [id, o] of others) {
    const A = a.map.get(id) || b.map.get(id), B = b.map.get(id) || A;
    if (!A) continue;
    const s = o.s;
    s.x = A[1] + (B[1] - A[1]) * k; s.y = A[2] + (B[2] - A[2]) * k; s.z = A[3] + (B[3] - A[3]) * k;
    s.yaw = A[4] + wrapA(B[4] - A[4]) * k; s.pitch = A[5] + (B[5] - A[5]) * k; s.cr = B[6]; s.alive = B[7];
    const g = o.g, u = g.userData;
    if (!s.alive) {
      o.dead = Math.min(1, o.dead + dt * 3);
      g.rotation.set(-Math.PI / 2 * o.dead, s.yaw, 0, 'YXZ');
      g.position.set(s.x, s.y + 0.15 * o.dead, s.z);
      if (o.tag) o.tag.visible = false;
      continue;
    }
    if (o.dead) { o.dead = 0; o.px = s.x; o.pz = s.z; }
    const sp2 = Math.hypot(s.x - o.px, s.z - o.pz) / Math.max(dt, 1e-3);
    o.px = s.x; o.pz = s.z;
    o.walk += dt * Math.min(sp2, 7) * 1.6;
    g.position.set(s.x, s.y, s.z);
    g.rotation.set(0, s.yaw, 0, 'YXZ');
    u.aim.rotation.x = s.pitch; u.head.rotation.x = s.pitch * 0.5;
    const sw = Math.sin(o.walk) * Math.min(1, sp2 / 3) * 0.7;
    if (s.cr) {
      u.torso.position.y = 0.55;
      u.legs.forEach((l, i) => { l.position.y = 0.55; l.rotation.x = -1.1 + (i ? sw : -sw) * 0.3; l.userData.knee.rotation.x = 1.7; });
    } else {
      u.torso.position.y = 0.9;
      u.legs.forEach((l, i) => { l.position.y = 0.9; l.rotation.x = i ? sw : -sw; l.userData.knee.rotation.x = Math.max(0, (i ? -sw : sw)) * 1.1; });
    }
    const mate = o.team === myTeam;
    if (mate && !o.tag) { const p = roster.get(id); if (p) { o.tag = nameTag(p.n, '#9fe0ff'); g.add(o.tag); } }
    if (o.tag) o.tag.visible = mate;
  }
}

/* ---------------- shooting ---------------- */
function curSpread() {
  const W = WEAPONS[cur], hs = Math.hypot(me.vx, me.vz);
  let s = W.spread.hip + (W.spread.ads - W.spread.hip) * adsT + W.spread.move * clamp(hs / PHYS.walk, 0, 1.3) + (me.ground ? 0 : 0.06) + bloom;
  if (me.cr) s *= 0.7;
  return s;
}
function ammoShown() {
  const lag = srv.pg / 1000 + 0.08, t = nowS();
  shotTimes = shotTimes.filter(x => t - x < lag + 0.05);
  return Math.max(0, srv.a - shotTimes.filter(x => t - x < lag).length);
}
function tryFire() {
  const W = WEAPONS[cur], t = nowS();
  if (!srv.al || phase !== 'play' || reloadT > 0 || t < nextFire || t - switchT < 0.35) return;
  if (ammoShown() <= 0) { if (srv.r > 0) { send({ t: 'r' }); nextFire = t + 0.4; } else blip(900, 0.05, 0.05); return; }
  if (!W.auto) { if (latch) return; latch = true; }
  nextFire = t + W.rate;
  const s = curSpread(), yaw = me.yaw + gauss() * s, pitch = me.pitch + gauss() * s;
  send({ t: 'f', yaw, pitch });
  shotTimes.push(t);
  bloom = Math.min(W.spread.max, bloom + W.spread.bloom);
  const kv = W.recoil.v * (1 - 0.4 * adsT) * (me.cr ? 0.8 : 1);
  me.pitch = clamp(me.pitch + kv, -1.5, 1.5); me.yaw += gauss() * W.recoil.h; recoilDebt += kv * 0.55;
  kick.z = cur === 'sniper' ? 0.12 : 0.05; kick.r = cur === 'sniper' ? 0.18 : 0.07;
  muzzle.visible = !(W.scope && adsT > 0.9); muzzle.material.rotation = Math.random() * 6; muzzle.userData.t = 0.045;
  flashLight.intensity = 6; vmFlashLight.intensity = 2;
  shotSfx(cur);
  // local prediction of where the bullet lands (the server decides hits)
  const eye = new THREE.Vector3(me.x, me.y + eyeH, me.z), d = dirFrom(yaw, pitch), o = [eye.x, eye.y, eye.z], n = [0, 0, 0];
  let tt = rayMap(o, d, BOXES, W.range, n), victim = false;
  for (const [, q] of others) { if (!q.s.alive || q.team === myTeam) continue; const h = hitbox(o, d, q.s); if (h.t < tt) { tt = h.t; victim = true; } }
  const end = new THREE.Vector3(o[0] + d[0] * tt, o[1] + d[1] * tt, o[2] + d[2] * tt);
  const from = cam.localToWorld(V.set(adsT > 0.5 ? 0 : 0.25, adsT > 0.5 ? -0.08 : -0.2, -2)).clone();
  if (cur !== 'pistol' || Math.random() < 0.5) tracer(from, end);
  if (victim) puff(end, 0x7a1f14, 0.3, 0.35); else if (tt < W.range) impact(end, n);
}
function remoteShot(m) {
  const o = new THREE.Vector3(...m.o), e = new THREE.Vector3(...m.e);
  const q = others.get(m.id);
  if (q) { o.set(q.s.x, q.s.y + (q.s.cr ? 1 : 1.4), q.s.z); q.lastShot = nowS(); }
  tracer(o, e);
  if (!m.hit) impact(e, null);
  const dx = o.x - me.x, dz = o.z - me.z, dist = Math.hypot(dx, dz);
  shotSfx(m.w, dist, -Math.sin(wrapA(Math.atan2(-dx, -dz) - me.yaw)));
}

/* ---------------- HUD events ---------------- */
let hitT = 0, dmgT = 0, vignT = 0;
function showHit(m) {
  const h = $('hitm'); h.className = m.kill ? 'kill' : ''; hitT = 0.22;
  blip(m.head ? 2400 : 1700, 0.05, 0.08);
  if (m.kill) { blip(880, 0.08, 0.1, 'triangle', 0.06); blip(1320, 0.12, 0.1, 'triangle', 0.14); }
}
function showDmg(m) {
  const rel = wrapA(Math.atan2(-(m.from[0] - me.x), -(m.from[1] - me.z)) - me.yaw);
  $('dmgdir').style.transform = `rotate(${-rel}rad)`; dmgT = 1; vignT = 0.6; lastHurt = nowS();
  noiseSfx(0.12, 600, 0.25);
}
const pname = id => roster.get(id)?.n || 'Unknown';
function onKill(m) {
  const kp = roster.get(m.k), vp_ = roster.get(m.v);
  const row = document.createElement('div');
  if (m.k === myId || m.v === myId) row.className = 'me';
  const a = document.createElement('span'); a.className = kp?.tm === 'red' ? 'r' : 'b'; a.textContent = kp ? kp.n : '';
  const w = document.createElement('em'); w.textContent = (WEAPONS[m.w]?.name || '') + (m.hs ? ' · headshot' : '');
  const b = document.createElement('span'); b.className = vp_?.tm === 'red' ? 'r' : 'b'; b.textContent = vp_ ? vp_.n : '';
  row.append(a, w, b);
  const feed = $('feed'); feed.prepend(row); while (feed.children.length > 6) feed.lastChild.remove();
  setTimeout(() => row.remove(), 6000);
  if (m.v === myId) { deathAt = { x: me.x, y: me.y + eyeH, z: me.z }; killer = m.k; noiseSfx(0.4, 300, 0.3); }
}
function showEnd(m) {
  const mine = m.winner === myTeam, c = $('center');
  c.textContent = ''; hudCache.center = null;
  const b = document.createElement('span'); b.className = 'big';
  b.textContent = m.winner === 'draw' ? 'DRAW' : mine ? 'VICTORY' : 'DEFEAT';
  c.append(b, `Red ${m.score[0]}  :  ${m.score[1]} Blue\nNext match in 10 seconds`);
}
function renderBoard() {
  const el = $('board'); el.textContent = '';
  for (const team of ['red', 'blue']) {
    const col = document.createElement('div'), h = document.createElement('h3');
    h.textContent = `${team === 'red' ? 'Red' : 'Blue'} · ${score[team === 'red' ? 0 : 1]}`;
    h.style.color = team === 'red' ? '#ff8a72' : '#7fb6ff';
    const tb = document.createElement('table'), hd = tb.insertRow();
    for (const t of ['Soldier', 'K', 'D']) { const th = document.createElement('th'); th.textContent = t; hd.append(th); }
    [...roster.values()].filter(p => p.tm === team).sort((a, b) => b.k - a.k || a.d - b.d).forEach(p => {
      const tr = tb.insertRow(); if (p.id === myId) tr.className = 'me';
      const n = tr.insertCell(); n.textContent = p.n;
      if (p.b) { const s = document.createElement('span'); s.className = 'bot'; s.textContent = 'BOT'; n.append(s); }
      tr.insertCell().textContent = p.k; tr.insertCell().textContent = p.d;
    });
    col.append(h, tb); el.append(col);
  }
}

/* ---------------- minimap ---------------- */
const mini = $('mini'), mg = mini.getContext('2d');
function drawMini() {
  const S = 300, c = S / 2, sc = S / 2 / 32;
  mg.clearRect(0, 0, S, S);
  mg.save(); mg.beginPath(); mg.arc(c, c, c - 2, 0, 7); mg.clip();
  mg.translate(c, c); mg.rotate(me.yaw); mg.scale(sc, sc); mg.translate(-me.x, -me.z);
  mg.fillStyle = 'rgba(216,201,163,.55)';
  for (const b of BOXES) if (b.min[1] < 2) mg.fillRect(b.min[0], b.min[2], b.max[0] - b.min[0], b.max[2] - b.min[2]);
  const t = nowS();
  for (const [, o] of others) {
    if (!o.s.alive) continue;
    const mate = o.team === myTeam;
    if (!mate && !(o.lastShot && t - o.lastShot < 2)) continue;
    mg.fillStyle = mate ? '#7fd3ff' : '#ff5a3c';
    mg.beginPath(); mg.arc(o.s.x, o.s.z, 0.9, 0, 7); mg.fill();
  }
  mg.restore();
  mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(c, c - 11); mg.lineTo(c - 7, c + 8); mg.lineTo(c + 7, c + 8); mg.fill();
}

/* ---------------- input ---------------- */
addEventListener('keydown', e => {
  if (!inGame || document.activeElement?.tagName === 'INPUT') return;
  K[e.code] = true;
  if (e.code === 'Tab') { e.preventDefault(); renderBoard(); $('board').hidden = false; }
  if (e.code === 'KeyR') send({ t: 'r' });
  if (e.code === 'Digit1' && cur !== lo) { cur = lo; switchT = nowS(); reloadT = 0; send({ t: 'w', w: lo }); }
  if (e.code === 'Digit2' && cur !== 'pistol') { cur = 'pistol'; switchT = nowS(); reloadT = 0; send({ t: 'w', w: 'pistol' }); }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { K[e.code] = false; if (e.code === 'Tab') $('board').hidden = true; });
addEventListener('blur', () => { for (const k in K) K[k] = false; trigger = false; ads = false; });
canvas.addEventListener('mousedown', e => {
  if (!inGame) return;
  if (document.pointerLockElement !== canvas && !lockFailed) { lock(); return; }
  audio();
  if (e.button === 0) { trigger = true; latch = false; }
  if (e.button === 2) ads = true;
});
addEventListener('mouseup', e => { if (e.button === 0) { trigger = false; latch = false; } if (e.button === 2) ads = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!inGame || !srv.al) return;
  if (document.pointerLockElement !== canvas && !(lockFailed && e.buttons)) return;
  const k = 0.0022 * sens * (cam.fov / 78);
  me.yaw -= e.movementX * k;
  me.pitch = clamp(me.pitch - e.movementY * k, -1.5, 1.5);
  sway.x += e.movementX * 0.00006; sway.y += e.movementY * 0.00006;
});
function lock() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => { lockFailed = true; });
  } catch { lockFailed = true; }
}
document.addEventListener('pointerlockchange', () => {
  if (!inGame) return;
  $('pauseOv').hidden = document.pointerLockElement === canvas;
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; $('pauseOv').hidden = true; });

/* ---------------- menu ---------------- */
$('nameIn').value = store.get('hanpan-name', 'Recruit' + Math.floor(Math.random() * 900 + 100));
const sensIn = $('sensIn'); sensIn.value = sens; $('sensOut').textContent = sens.toFixed(1);
sensIn.oninput = () => { sens = +sensIn.value; $('sensOut').textContent = sens.toFixed(1); store.set('hanpan-sens', sens); };
function paintLo() { for (const b of $('loSeg').children) b.setAttribute('aria-pressed', b.dataset.lo === lo); }
$('loSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; lo = b.dataset.lo; store.set('hanpan-lo', lo); paintLo(); };
paintLo();
let land = store.get('hanpan-land', DEFAULT_MAP);
if (land !== 'any' && !isMap(land)) land = DEFAULT_MAP;
function floorPlan(map) {
  const c = document.createElement('canvas'), [hx, hz] = map.size, g = c.getContext('2d');
  c.width = 160; c.height = 80;
  // turned sideways so Red is on the left and Blue on the right
  const k = Math.min(156 / (hz * 2), 76 / (hx * 2)), w = hz * 2 * k, h = hx * 2 * k;
  g.translate(80, 40);
  g.fillStyle = map.theme.ground[0]; g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = 'rgba(15,17,12,.6)';
  for (const b of map.boxes) if (b.min[1] < 2 && b.kind !== 'perimeter') g.fillRect(b.min[2] * k, -b.max[0] * k, (b.max[2] - b.min[2]) * k, (b.max[0] - b.min[0]) * k);
  g.fillStyle = '#ff6a4d'; g.fillRect(-w / 2, -h / 2, 5, h);
  g.fillStyle = '#5aa5ff'; g.fillRect(w / 2 - 5, -h / 2, 5, h);
  return c;
}
for (const { id, name, desc } of [...MAP_LIST, { id: 'any', name: 'Any land', desc: 'Join the busiest match' }]) {
  const b = document.createElement('button'), n = document.createElement('b'), d = document.createElement('small');
  b.type = 'button'; b.dataset.land = id; n.textContent = name; d.textContent = desc;
  if (id === 'any') { const q = document.createElement('span'); q.className = 'any'; q.textContent = '?'; q.ariaHidden = 'true'; b.append(q); } else b.append(floorPlan(getMap(id)));
  b.append(n, d); $('landSeg').append(b);
}
function paintLand() {
  for (const b of $('landSeg').children) b.setAttribute('aria-pressed', b.dataset.land === land);
  if (land !== 'any') loadMap(land);   // show the chosen land behind the menu
}
$('landSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; land = b.dataset.land; store.set('hanpan-land', land); paintLand(); };
loadMap(land);
paintLand();
const status = t => { $('status').textContent = t; };
// wallet login (optional; guests can always play)
function paintAccount(user) {
  const box = $('account');
  box.textContent = '';
  if (!configured) return;
  const a = document.createElement('a');
  a.href = 'login.html';
  if (user) { const w = walletOf(user); a.textContent = shortWallet(w); a.title = 'Signed in as ' + w; } else a.textContent = 'Log in with wallet';
  box.append(a);
  if (!user) return;
  const out = document.createElement('button');
  out.type = 'button'; out.textContent = 'Log out';
  out.onclick = () => signOut().then(() => paintAccount(null), () => status('Could not log out. Try again.'));
  box.append(out);
}
if (maybeSignedIn()) currentUser().then(paintAccount, () => paintAccount(null)); else paintAccount(null);
function playerName() { const n = cleanName($('nameIn').value); store.set('hanpan-name', n); return n; }

function enterGame() {
  inGame = true; $('menu').hidden = true; $('hud').hidden = false; status('');
  snaps = []; offEst = null; cur = lo; wasAlive = true; deathAt = null;
  for (const [, o] of others) scene.remove(o.g); others.clear();
}
function leaveGame(msg = '') {
  if (net) { const n = net; net = null; n.close(); }
  inGame = false; $('hud').hidden = true; $('pauseOv').hidden = true; $('menu').hidden = false; status(msg); paintLand();
  if (document.pointerLockElement) document.exitPointerLock();
  for (const [, o] of others) scene.remove(o.g); others.clear();
}
$('practice').onclick = () => {
  audio(); lock();
  const room = new Room({ id: 'practice', minPlayers: 8, map: land === 'any' ? randomMap() : land });
  let live = true;
  const id = room.addPlayer(playerName(), lo, m => queueMicrotask(() => live && onMsg(m)));
  const timer = setInterval(() => room.update(1 / 30), 1000 / 30);
  net = { send: m => room.onMessage(id, m), close() { live = false; clearInterval(timer); } };
  enterGame();
};
$('online').onclick = () => {
  audio(); lock();
  if (!/^https?:$/.test(location.protocol)) { status('Open this page from the game server to play online.'); return; }
  status('Connecting…');
  let ws, opened = false;
  try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); }
  catch { status('No game server found at this address. Try Practice, or deploy the server.'); return; }
  const to = setTimeout(() => { if (!opened) { ws.close(); status('No game server found at this address. Try Practice, or deploy the server.'); if (document.pointerLockElement) document.exitPointerLock(); } }, 4000);
  ws.onopen = () => {
    opened = true; clearTimeout(to);
    ws.send(JSON.stringify({ t: 'join', name: playerName(), lo, map: land }));
    net = { send: m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }, close: () => ws.close() };
    enterGame();
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => { if (inGame && net) leaveGame('Disconnected from the server.'); };
  ws.onerror = () => {};
};
$('resume').onclick = () => lock();
$('leave').onclick = () => leaveGame();

/* ---------------- frame ---------------- */
function resize() {
  const w = innerWidth, h = innerHeight;
  R.setSize(w, h, false); cam.aspect = vmCam.aspect = w / h; cam.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const fmtT = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
let last = nowS(), menuA = 0;
function frame() {
  requestAnimationFrame(frame);
  const t = nowS(), dt = Math.min(0.05, t - last); last = t;
  updateFx(dt);
  if (inGame) {
    updateLocal(dt, t);
    interpRemotes(dt);
    updateHud(dt, t);
    drawMini();
  } else {
    menuA += dt * 0.05;
    cam.position.set(Math.sin(menuA) * 46, 18, Math.cos(menuA) * 46); cam.lookAt(0, 0, 0);
    cam.fov = 60; cam.updateProjectionMatrix();
  }
  updateSnow(dt);
  R.clear(); R.render(scene, cam);
  const W = WEAPONS[cur];
  if (inGame && srv.al && !(W.scope && adsT > 0.9)) { R.clearDepth(); R.render(vmScene, vmCam); }
}

function updateLocal(dt, t) {
  const W = WEAPONS[cur];
  if (srv.al) {
    const f = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), s = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
    let ix = -Math.sin(me.yaw) * f + Math.cos(me.yaw) * s, iz = -Math.cos(me.yaw) * f - Math.sin(me.yaw) * s;
    const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
    const wantCr = !!K.KeyC;
    me.cr = wantCr || (me.cr && !!hits(me.x, me.y, me.z, PHYS.h, BOXES));
    const sprint = K.ShiftLeft && f > 0 && !me.cr && !ads && !trigger;
    const speed = me.cr ? PHYS.crouch : ads ? PHYS.ads * (cur === 'pistol' ? 1.3 : 1) : sprint ? PHYS.sprint : PHYS.walk;
    if (K.Space && me.ground) { me.vy = PHYS.jump; me.ground = false; }
    step(me, ix, iz, speed, dt, BOXES);
    eyeH += ((me.cr ? PHYS.eyec : PHYS.eye) - eyeH) * Math.min(1, dt * 12);
    const hs = Math.hypot(me.vx, me.vz);
    if (me.ground && hs > 1) { bobT += dt * hs * 1.7; stepAcc += hs * dt; if (stepAcc > (sprint ? 2.4 : 1.9) && !me.cr) { stepAcc = 0; noiseSfx(0.07, 700, 0.05); } }
    adsT += ((ads && reloadT <= 0 && !sprint ? 1 : 0) - adsT) * Math.min(1, dt * (cur === 'sniper' ? 7 : 11));
    bloom = Math.max(0, bloom - dt * 0.12);
    const rec = Math.min(recoilDebt, dt * 0.35); me.pitch -= rec; recoilDebt -= rec;
    if (trigger) tryFire();
    if (reloadT > 0) reloadT -= dt;
    inputAcc += dt;
    if (inputAcc >= 0.05) {
      inputAcc = 0;
      send({ t: 'in', sp, x: +me.x.toFixed(3), y: +me.y.toFixed(3), z: +me.z.toFixed(3), yaw: +me.yaw.toFixed(4), pitch: +me.pitch.toFixed(4), cr: me.cr ? 1 : 0 });
    }
    cam.position.set(me.x, me.y + eyeH + Math.sin(bobT * 2) * 0.025 * (1 - adsT), me.z);
    cam.rotation.set(me.pitch, me.yaw, Math.sin(bobT) * 0.004);
  } else if (deathAt) {
    adsT = 0; trigger = false;
    const k = others.get(killer);
    cam.position.lerp(V.set(deathAt.x, deathAt.y + 2.2, deathAt.z), Math.min(1, dt * 2));
    if (k) cam.lookAt(k.s.x, k.s.y + 1.2, k.s.z);
  }
  const fov = 78 + (W.fov - 78) * adsT;
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  // viewmodel
  for (const k in VMS) VMS[k].g.visible = k === cur;
  const vm = VMS[cur];
  if (vm) {
    const sw = Math.max(0, 0.35 - (t - switchT)) / 0.35;
    const rl = reloadT > 0 ? Math.sin(Math.PI * (1 - reloadT / reloadDur)) : 0;
    sway.x *= 1 - Math.min(1, dt * 8); sway.y *= 1 - Math.min(1, dt * 8);
    kick.z *= 1 - Math.min(1, dt * 16); kick.r *= 1 - Math.min(1, dt * 14);
    const bob = 1 - adsT;
    vm.g.position.lerpVectors(vm.hip, vm.ads, adsT);
    vm.g.position.x += (Math.sin(bobT) * 0.012 - sway.x) * bob;
    vm.g.position.y += (-Math.abs(Math.cos(bobT)) * 0.01 + sway.y) * bob - sw * 0.3 - rl * 0.12;
    vm.g.position.z += kick.z;
    vm.g.rotation.set(kick.r + rl * 0.7, -sway.x * 2 * bob + rl * 0.3, -rl * 0.25);
    muzzle.position.copy(vm.muzzle).applyEuler(vm.g.rotation).add(vm.g.position);
    muzzle.scale.setScalar(cur === 'pistol' ? 0.12 : 0.2);
  }
  if (muzzle.visible && (muzzle.userData.t -= dt) <= 0) muzzle.visible = false;
  flashLight.position.copy(cam.position); flashLight.intensity *= 1 - Math.min(1, dt * 30); vmFlashLight.intensity *= 1 - Math.min(1, dt * 30);
}

let hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updateHud(dt, t) {
  const W = WEAPONS[cur];
  setText('sR', score[0]); setText('sB', score[1]); setText('clock', fmtT(timeLeft));
  setText('hpN', Math.max(0, srv.hp)); $('hpB').style.width = clamp(srv.hp, 0, 100) + '%';
  $('hpB').style.background = srv.hp > 35 ? '#7fd36b' : '#e5533d';
  setText('wName', W.name); setText('ammoN', ammoShown()); setText('resN', '/ ' + srv.r);
  $('rlB').style.width = reloadT > 0 ? (1 - reloadT / reloadDur) * 100 + '%' : '0';
  setText('net', `${MAP.name}\nping ${srv.pg} ms`);
  const gap = 4 + curSpread() / Math.tan(cam.fov * Math.PI / 360) * innerHeight / 2;
  const cr = $('cross');
  cr.style.opacity = srv.al && adsT < 0.4 ? 1 : 0;
  cr.children[0].style.top = -gap - 9 + 'px'; cr.children[1].style.top = gap + 'px';
  cr.children[2].style.left = -gap - 9 + 'px'; cr.children[3].style.left = gap + 'px';
  hitT = Math.max(0, hitT - dt); $('hitm').style.opacity = hitT > 0 ? 1 : 0;
  dmgT = Math.max(0, dmgT - dt * 0.8); $('dmgdir').style.opacity = dmgT;
  vignT = Math.max(0, vignT - dt); $('vign').style.opacity = Math.max(vignT, srv.al && srv.hp < 35 ? 0.35 : 0);
  $('scope').style.display = W.scope && adsT > 0.9 && srv.al ? 'block' : 'none';
  if (!srv.al && phase === 'play') {
    setText('center', `Eliminated by ${pname(killer)}\nRedeploying in ${srv.rs.toFixed(1)}`);
  } else if (srv.al && srv.pr && phase === 'play') setText('center', 'Spawn protection');
  else if (phase === 'play') setText('center', '');
}
requestAnimationFrame(frame);
