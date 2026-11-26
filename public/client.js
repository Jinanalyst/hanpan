// HANPAN client: rendering, local movement prediction, interpolation of other players, HUD and audio.
import * as THREE from 'three';
import { getMap, isMap, isReal, isReady, addCity, canPlay, randomMap, groundAt, MAP_LIST, DEFAULT_MAP } from './shared/map.js';
import { PHYS, NADE_DT, step, stepNade, nadeStart, stanceEye, fitStance, WALL, alongWall, leanOff, wallAt, lowWall, findWall, peekRoom, dirFrom, hits, rayMap, hitbox } from './shared/physics.js';
import { WEAPONS, EQUIP, PRIMARIES, SIDEARMS } from './shared/weapons.js';
import { SLOTS, itemsOf, packGear, unpackGear } from './shared/gear.js';
import { loadProfile, saveProfile, activeKit, loadName, saveName, addRecord } from './profile.js';
import { makeSoldier, setWeapon, disposeSoldier, outfit } from './soldier.js';
import { buildGun, buildEquip } from './arsenal.js';
import { bake, box, dispose } from './models.js';
import { snap, closeStudio } from './studio.js';
import { cityMat, isCityKind, drawCityBox, cityWall, cityRing, landmark, mergeStatic } from './cityscape.js';
import { loadCity, buildCity, attribution } from './osmcity.js';
import { isFrontKind, drawFrontBox, buildFront, createWar, BOMB_REACH } from './front.js';
import { AIR_NAMES } from './shared/air.js';
import { floorPlan } from './floorplan.js';
import { createVoice } from './voice.js';
import { createBattle, clampVolume } from './battle.js';
import { Room, cleanName, DROP } from './shared/game.js';
import { configured, currentUser, maybeSignedIn, signOut, accessToken, ownedProducts, walletOf, shortWallet } from './auth.js';

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
R.debug.checkShaderErrors = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);   // asking for errors makes the page wait for the graphics driver

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
scene.add(sun, sun.target);
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
  hull: ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#aeb7c4'; g.fillRect(0, 0, w, h); speck(g, w, h, 1600, ['#a3acb9', '#bac3cf'], 2);
    g.strokeStyle = 'rgba(40,50,70,.5)'; g.lineWidth = 3; for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 128) g.strokeRect(x + (y / 64 % 2) * 64, y, 128, 64);
  }),
  basalt: ctex(256, 256, (g, w, h) => { g.fillStyle = '#3c3836'; g.fillRect(0, 0, w, h); speck(g, w, h, 5000, ['#322e2c', '#4a4542', '#575049'], 6); }),
  lava: ctex(128, 128, (g, w, h) => { g.fillStyle = '#ff7a1f'; g.fillRect(0, 0, w, h); speck(g, w, h, 500, ['#ffb84a', '#e04a10', '#ffe08a'], 12); }),
  tile: ctex(128, 128, (g, w, h) => { g.fillStyle = '#3d4a52'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = '#55646d'; g.fillRect(x, 0, 8, h); } }),
  redwood: ctex(128, 128, (g, w, h) => { g.fillStyle = '#9c2f26'; g.fillRect(0, 0, w, h); speck(g, w, h, 700, ['#8c2820', '#ab3a30'], 3); g.fillStyle = '#2f7d6b'; g.fillRect(0, 0, w, 14); }),
  plaster: ctex(128, 128, (g, w, h) => { g.fillStyle = '#e6dcc8'; g.fillRect(0, 0, w, h); speck(g, w, h, 700, ['#dbd0ba', '#efe7d6'], 3); g.fillStyle = '#8d8778'; g.fillRect(0, h * 0.8, w, h * 0.2); }),
  hedge: ctex(128, 128, (g, w, h) => { g.fillStyle = '#4b6d38'; g.fillRect(0, 0, w, h); speck(g, w, h, 1800, ['#3d5c2d', '#5c8245', '#6d9450'], 5); }),
  hoard: ctex(256, 128, (g, w, h) => {
    for (let x = 0; x < w; x += 64) { g.fillStyle = x % 128 ? '#e3e5e2' : '#d6d9d6'; g.fillRect(x, 0, 63, h); }
    g.fillStyle = '#2f7d4f'; g.fillRect(0, 0, w, 22); g.fillStyle = '#e0a52a'; g.fillRect(0, h - 16, w, 16);
    speck(g, w, h, 500, ['#c4c8c4', '#f1f3f1'], 2);
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
  hull: std({ map: T.hull, roughness: 0.6, metalness: 0.2 }), basalt: std({ map: T.basalt }), lava: new THREE.MeshBasicMaterial({ map: T.lava }), tile: std({ map: T.tile, roughness: 0.7 }),
  redwood: std({ map: T.redwood, roughness: 0.7 }), plaster: std({ map: T.plaster }), hedge: std({ map: T.hedge }), blossom: std({ map: T.wood }), petal: std({ color: 0xf2a5c0 }),
  neonM: new THREE.MeshBasicMaterial({ color: 0xff5fb4 }), neonC: new THREE.MeshBasicMaterial({ color: 0x5fe3ff }), neonY: new THREE.MeshBasicMaterial({ color: 0xffd75a }),
  sandbag: std({ map: T.sandbag }), barrier: std({ map: T.barrier }), hoard: std({ map: T.hoard, roughness: 0.7 }), barrel: std({ color: 0x46603d, roughness: 0.55, metalness: 0.35 }),
};
const CONT = ['#8c3b2a', '#2f5d7c', '#4c6b3a'].map(c => std({ map: containerTex(c), roughness: 0.7, metalness: 0.2 }));

function boxGeo(w, h, d, s) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / s, uv.getY(k) * dims[f][1] / s); }
  return g;
}
const TEXM = { hoard: 4, container: 3, sandbag: 2, barrier: 4, snow: 4, rock: 4, stone: 4, cloth: 1.5 };   // meters per texture repeat
const GLOW = /^(neon|screen|lava)/;
const FIT = new Set(['vend', 'phone', 'screenA', 'screenB']);   // one picture per face
function fitUV(g) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, i % 4 % 2, i % 4 < 2 ? 1 : 0); }
function buildWorld(map) {
  const g = new THREE.Group(), th = map.theme;
  const night = !!th.night;
  const wall = std({ map: T.concrete, color: th.wall }), perim = std({ map: T.concrete, color: th.perimeter });
  let ci = 0;
  for (const b of [...map.boxes, ...map.decor]) {
    if (b.kind === 'building') continue;   // drawn from the city's own outlines
    const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
    if (isCityKind(b.kind) && drawCityBox(g, b, w, h, d, (b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2, night)) continue;
    if (th.front && b.kind === 'perimeter') continue;   // cliffs, sea and hills take its place
    if (isFrontKind(b.kind)) { drawFrontBox(g, b, w, h, d, (b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2, T); continue; }
    if (th.ring && b.kind === 'perimeter') { cityWall(g, w, h, d, (b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2, ci++, night); continue; }
    const x = (b.min[0] + b.max[0]) / 2, z = (b.min[2] + b.max[2]) / 2;
    let m;
    if (b.kind === 'barrel') m = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 18), MAT.barrel);
    else if (b.kind === 'tree' || b.kind === 'blossom') {
      m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.4, w * 0.5, h, 10), MAT.tree);
      for (const [y, r] of [[h - 1.2, 2.4], [h + 0.4, 1.9], [h + 1.8, 1.2]]) {   // leaves are only for looks and sit above head height
        const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), b.kind === 'tree' ? MAT.leaf : MAT.petal);
        l.scale.y = 0.6; l.position.set(x, y, z); l.castShadow = true; g.add(l);
      }
    } else {
      const mat = b.kind === 'container' ? CONT[ci++ % 3] : b.kind === 'wall' ? wall : b.kind === 'perimeter' ? perim : MAT[b.kind] || cityMat(b.kind) || wall;
      m = new THREE.Mesh(boxGeo(w, h, d, b.kind === 'crate' || FIT.has(b.kind) ? Math.max(w, h, d) : TEXM[b.kind] || 3), mat);
      if (FIT.has(b.kind)) fitUV(m.geometry);
    }
    m.position.set(x, (b.min[1] + b.max[1]) / 2, z);
    const flat = h < 0.08;
    m.castShadow = !GLOW.test(b.kind) && !flat; m.receiveShadow = !GLOW.test(b.kind);
    g.add(m);
  }
  if (map.city) {
    mergeStatic(g);
    g.add(buildCity(map.city).group);
    return g;
  }
  if (th.front) {
    mergeStatic(g);
    g.add(g.userData.front = buildFront(map));
    return g;
  }
  const gt = groundTex(th.ground); gt.repeat.set(65, 65);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), std({ map: gt }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
  if (th.ring) {
    cityRing(g, map.size, th.ring, night);
    const [kind, x, z] = th.landmark, L = landmark(kind, night);
    L.position.set(x, 0, z); g.add(L);
  }
  const [shape, farC] = th.far, far = std({ map: T.concrete, color: farC }), lit = [MAT.neonM, MAT.neonC, MAT.neonY];
  for (let i = 0; i < (shape === 'city' ? 0 : 34); i++) { // distant structures for depth
    const a = i / 34 * Math.PI * 2 + rnd(-0.05, 0.05), r = rnd(78, 140), w = rnd(8, 22), h = shape === 'tower' ? rnd(14, 42) : rnd(5, 18);
    const m = shape === 'peak' ? new THREE.Mesh(new THREE.ConeGeometry(w * 1.1, h * 1.6, 7), far) : new THREE.Mesh(boxGeo(w, h, rnd(8, 20), 4), far);
    m.position.set(Math.cos(a) * r, shape === 'peak' ? h * 0.8 : h / 2, Math.sin(a) * r); m.rotation.y = rnd(0, 3); g.add(m);
    if (shape === 'tower') {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.8, 1), lit[i % 3]);
      s.position.set(m.position.x * 0.88, h * rnd(0.4, 0.8), m.position.z * 0.88); s.lookAt(0, s.position.y, 0); g.add(s);
    }
  }
  if (th.stars) {
    const p = [];
    for (let i = 0; i < 900; i++) { const a = rnd(0, 6.283), y = rnd(0.05, 1), r = Math.sqrt(1 - y * y); p.push(Math.cos(a) * r * 450, y * 450, Math.sin(a) * r * 450); }
    g.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3)), new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2, sizeAttenuation: false, fog: false })));
  }
  mergeStatic(g);
  for (const [x, y, z, c] of map.lights) { const l = new THREE.PointLight(c, 45, 18, 1.8); l.position.set(x, y, z); g.add(l); }
  return g;
}
// snow, petals or embers, kept around the camera
const AIR_R = 22;
const air = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from({ length: 1400 * 3 }, () => rnd(-AIR_R, AIR_R)), 3)),
  new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false }));
air.frustumCulled = false; air.visible = false; scene.add(air);
function updateAir(dt) {
  const P = MAP.theme.particles;
  if (!P) return;
  const c = [cam.position.x, cam.position.y, cam.position.z];
  // none under roofs
  air.visible = !BOXES.some(b => b.max[0] - b.min[0] > 6 && b.min[1] > c[1] && c[0] > b.min[0] && c[0] < b.max[0] && c[2] > b.min[2] && c[2] < b.max[2]);
  const p = air.geometry.attributes.position, a = p.array, span = AIR_R * 2;
  for (let i = 0; i < a.length; i += 3) {
    a[i] += dt * 0.6; a[i + 1] -= dt * P.fall;
    for (let k = 0; k < 3; k++) a[i + k] = c[k] + ((a[i + k] - c[k] + AIR_R) % span + span) % span - AIR_R;   // wrap around the camera
  }
  p.needsUpdate = true;
}
// Shadows cover the whole of a small land. On a big one they stay around the camera.
const SHADOW = { small: [56, 180, -0.0004, 0.03], front: [66, 180, -0.0004, 0.04], big: [75, 520, -0.0005, 0.07] };
function fitShadow(big) {
  const [r, far, bias, nb] = SHADOW[big ? 'big' : MAP.theme.front ? 'front' : 'small'], c = sun.shadow.camera;
  if (c.right !== r) { Object.assign(c, { left: -r, right: r, top: r, bottom: -r, far }); c.updateProjectionMatrix(); sun.shadow.bias = bias; sun.shadow.normalBias = nb; }
  if (!big) { sun.target.position.set(0, 0, 0); sun.position.set(...MAP.theme.sun[2]); return; }
  const s = r * 2 / 2048 * 16, x = Math.round(cam.position.x / s) * s, z = Math.round(cam.position.z / s) * s, d = MAP.theme.sun[2];   // whole shadow pixels, so edges do not crawl
  sun.target.position.set(x, 0, z); sun.position.set(x + d[0] * 2, d[1] * 2, z + d[2] * 2);
}
// Real cities come in a file of their own, loaded the first time one is chosen.
const loading = {};
function ensureMap(id) {
  if (!isReal(id) || isReady(id)) return Promise.resolve();
  return (loading[id] ||= loadCity(id).then(addCity).finally(() => { delete loading[id]; }));
}
const worlds = {};
let world = null;
function loadMap(id) {
  const next = getMap(id);
  if (!isReady(next.id)) return;   // only a plan so far
  if (world && next === MAP) return;
  MAP = next; BOXES = MAP.boxes;
  if (world) world.visible = false;
  if (!worlds[MAP.id]) { worlds[MAP.id] = buildWorld(MAP); scene.add(worlds[MAP.id]); }
  world = worlds[MAP.id]; world.visible = true;
  const th = MAP.theme;
  paintSky(th.skyTop, th.skyHor);
  scene.fog.color.set(th.fog[0]); scene.fog.near = th.fog[1]; scene.fog.far = th.fog[2];
  hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2];
  sun.color.set(th.sun[0]); sun.intensity = th.sun[1];
  fitShadow(!!MAP.city);
  war.load(MAP, T);
  $('osm').replaceChildren(...(MAP.city ? [attribution(MAP.city)] : []));
  vmHemi.intensity = vmSun.intensity = 2.2 * th.vm;
  air.visible = !!th.particles;
  if (th.particles) { air.material.color.set(th.particles.color); air.material.size = th.particles.size; }
  for (const m of [...tracers, ...puffs]) m.visible = false;
  decals.count = decalI = 0;
  if (built) warm();
}

/* ---------------- soldiers ---------------- */
function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const g = c.getContext('2d'); g.font = '700 30px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(text, 128, 24); g.fillStyle = color; g.fillText(text, 128, 24);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.3, 1); s.position.y = 2.15; return s;
}

/* ---------------- viewmodel ---------------- */
function vmArms(g, M, left, right) {
  for (const [p, q] of [[right, 1], [left, -1]]) {
    box(g, 0.06, 0.07, 0.1, p[0], p[1], p[2], M.glove, 0.02);
    box(g, 0.08, 0.08, 0.5, p[0] + q * 0.06, p[1] - 0.09, p[2] + 0.27, M.cloth, 0.025, 0.32, q * 0.12);
  }
}
function buildVMGun(id, M, finish) {
  const v = buildGun(id, finish);
  vmArms(v.g, M, v.left, v.right);
  bake(v.g, false);
  for (const m of v.g.children) if (m.isMesh) m.material = vmMat(m.material);
  return v;
}
// The soldiers' materials, kept apart for the gun in your own hands: a material used under two sets of lights is set up again every frame.
const vmMats = new Map();
function vmMat(m) {
  let c = vmMats.get(m);
  if (!c) { c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; vmMats.set(m, c); }
  return c;
}
const flashTex = ctex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,190,80,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,240,200,.9)'; for (let i = 0; i < 6; i++) { g.save(); g.translate(32, 32); g.rotate(i * Math.PI / 3); g.fillRect(-1.5, 0, 3, 30); g.restore(); }
});
const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
muzzle.visible = false;
let VMS = {}, vmTeam = '', vmOutfit = null, vmGear = null;
const vmRoot = new THREE.Group(); vmScene.add(vmRoot);
function buildVM(team) {
  const key = team + packGear(kit().gear);
  if (key === vmTeam) { vmGun(act.lo); vmGun(act.sa); return; }
  vmTeam = key;
  vmRoot.remove(muzzle); dispose(vmRoot); vmRoot.clear();
  vmGear = kit().gear; vmOutfit = outfit(team, vmGear);
  VMS = {};
  vmRoot.add(muzzle);
  for (const k of new Set([act.lo, act.sa, cur])) vmGun(k);
}
// Guns are built when they are first carried, not all at once.
function vmGun(k) {
  if (VMS[k] || !vmOutfit || !WEAPONS[k]) return VMS[k];
  const v = VMS[k] = buildVMGun(k, vmOutfit, vmGear.finish);
  v.g.visible = false; vmRoot.add(v.g);
  return v;
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
const decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 0.14), new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 80);   // one draw call for all holes
decals.count = 0; decals.frustumCulled = false; scene.add(decals);
const hole = new THREE.Object3D();
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
  hole.position.set(p.x + n[0] * 0.01, p.y + n[1] * 0.01, p.z + n[2] * 0.01);
  hole.lookAt(p.x + n[0], p.y + n[1], p.z + n[2]); hole.rotation.z = Math.random() * 6; hole.updateMatrix();
  decals.setMatrixAt(decalI % 80, hole.matrix); decals.instanceMatrix.needsUpdate = true;
  decals.count = Math.min(80, ++decalI);
}
function updateFx(dt) {
  for (const m of tracers) if (m.visible) { m.userData.t -= dt; m.material.opacity = Math.max(0, m.userData.t / 0.07) * 0.55; if (m.userData.t <= 0) m.visible = false; }
  for (const s of puffs) if (s.visible) {
    const u = s.userData; u.t -= dt; const k = u.t / u.m;
    s.material.opacity = Math.max(0, k * 0.8); s.scale.setScalar(u.s * (1 + (1 - k) * 1.5)); s.position.y += dt * 0.3;
    if (u.t <= 0) s.visible = false;
  }
}

/* ---------------- grenades ---------------- */
const nades = new Map();   // in the air: id -> { m, n, acc, fuse }
function nadeThrown(m) {
  if (!EQUIP[m.w]?.thrown) return;
  const g = bake(buildEquip(m.w)), n = { x: m.o[0], y: m.o[1], z: m.o[2], vx: m.v[0], vy: m.v[1], vz: m.v[2] };
  g.position.set(n.x, n.y, n.z); scene.add(g);
  nades.set(m.id, { g, n, acc: 0, left: EQUIP[m.w].fuse + 3, w: m.w, tm: m.tm, by: m.by, stuck: !!m.st });
  if (m.by === myId) { noiseSfx(0.12, 1400, 0.2); switchT = nowS(); reloadT = 0; }
}
function nadeStuck(m) {
  const q = nades.get(m.id);
  if (!q) return;
  q.stuck = true; q.g.rotation.set(0, q.g.rotation.y, 0);
  [q.n.x, q.n.y, q.n.z] = m.p; q.g.position.set(...m.p);
  noiseSfx(0.06, 900, 0.2);
  // a blinking light in the team's colour shows who placed it
  const L = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: q.tm === myTeam ? 0x5fff6a : 0xff3a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  L.scale.setScalar(0.28); L.position.y = 0.1; q.g.add(L); q.light = L;
}
const myCharge = () => { for (const q of nades.values()) if (q.w === 'charge' && q.by === myId) return q; return null; };
function nadeGone(id) { const q = nades.get(id); if (q) { scene.remove(q.g); dispose(q.g); nades.delete(id); } }
function nadeBurst(m) {
  nadeGone(m.id);
  const p = new THREE.Vector3(...m.p), dx = p.x - me.x, dz = p.z - me.z, dist = Math.hypot(dx, dz), pan = -Math.sin(wrapA(Math.atan2(-dx, -dz) - me.yaw)), v = 1 / (1 + dist * 0.05);
  if (m.w === 'bomb') { war.blast(m.p); blastLight.position.set(p.x, p.y + 1.5, p.z); blastLight.intensity = 320; return; }
  if (m.w === 'fizz') { puff(p, 0x888888, 0.5, 0.5); noiseSfx(0.2, 2400, 0.2 * v); return; }
  if (m.w === 'fire') { addFire(p, m.d || EQUIP.fire.burns); noiseSfx(0.8, 500, 0.45 * v); noiseSfx(0.15, 4200, 0.25 * v); return; }
  if (m.w === 'flash') {
    puff(p, 0xffffff, 1.6, 0.25); blastLight.position.set(p.x, p.y + 0.4, p.z); blastLight.intensity = 140;
    shotSfx('pistol', dist * 0.3, pan); noiseSfx(0.25, 3800, 0.5 * v);
    return;
  }
  if (m.w === 'smoke') { addSmoke(p, m.d || EQUIP.smoke.lasts); noiseSfx(0.9, 3000, 0.22 * v); return; }
  for (let i = 0; i < 9; i++) puff(V.set(p.x + rnd(-0.8, 0.8), p.y + rnd(0.1, 1.2), p.z + rnd(-0.8, 0.8)), i < 4 ? 0xffb040 : 0x3a342c, rnd(1.2, 2.4), rnd(0.35, 0.9));
  for (let i = 0; i < 8; i++) tracer(p, V.set(p.x + rnd(-4, 4), p.y + rnd(0.3, 3), p.z + rnd(-4, 4)).clone());
  blastLight.position.set(p.x, p.y + 0.6, p.z); blastLight.intensity = 90;
  shotSfx('sniper', dist * 0.4, pan); noiseSfx(0.7, 140, 0.9 * v); noiseSfx(0.5, 400, 0.6 * v, 0.03);
  if (dist < 14) shake = Math.max(shake, 0.05 * (1 - dist / 14));
}
const blastLight = new THREE.PointLight(0xffa050, 0, 16, 2); scene.add(blastLight);
let shake = 0;
const fires = [];    // { g, t, life }
const FLAME = [0xff7a1f, 0xffb038, 0xff4a14].map(c => new THREE.Color(c)), flameC = new THREE.Color();
function fireModel() {
  const g = new THREE.Group();   // the flames are one draw call; added light, so a darker colour is a fainter flame
  const flames = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: puffTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), 44);
  flames.frustumCulled = false;
  flames.userData.list = Array.from({ length: 44 }, (_, i) => {
    const a = Math.random() * 6.283, R = Math.sqrt(Math.random()) * EQUIP.fire.radius * 0.9;
    return { x: Math.cos(a) * R, z: Math.sin(a) * R, s: rnd(0.9, 1.8), o: Math.random(), c: FLAME[i % 3] };
  });
  g.add(flames);
  const burnt = new THREE.Mesh(new THREE.CircleGeometry(EQUIP.fire.radius, 28), new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  burnt.rotation.x = -Math.PI / 2; burnt.position.y = 0.05; burnt.userData.ground = true; g.add(burnt);
  return g;
}
function addFire(p, life) {
  const g = fireModel();
  g.position.set(p.x, p.y, p.z); scene.add(g);
  fires.push({ g, t: 0, life, crackle: 0 });
}
function freeGroup(g) { scene.remove(g); for (const m of g.children) { m.material.dispose(); if (m.isInstancedMesh) m.dispose(); if (m.isMesh) m.geometry.dispose(); } }
function updateFires(dt) {
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.t += dt;
    const grow = Math.min(1, f.t / 0.4) * Math.min(1, Math.max(0, (f.life - f.t) / 0.8));
    for (const m of f.g.children) {
      if (m.userData.ground) { m.material.opacity = 0.55 * Math.min(1, f.t * 2, Math.max(0, f.life - f.t + 1)); continue; }
      hole.quaternion.copy(cam.quaternion);
      m.userData.list.forEach((u, q) => {
        const k = (f.t * 1.3 + u.o) % 1;
        hole.position.set(u.x, 0.15 + k * 1.1, u.z); hole.scale.setScalar(u.s * (1.2 - k * 0.8) * (0.3 + 0.7 * grow)); hole.updateMatrix();
        m.setMatrixAt(q, hole.matrix); m.setColorAt(q, flameC.copy(u.c).multiplyScalar((1 - k) * 0.85 * grow));
      });
      hole.scale.setScalar(1);
      m.instanceMatrix.needsUpdate = m.instanceColor.needsUpdate = true;
    }
    const d = Math.hypot(f.g.position.x - me.x, f.g.position.z - me.z);
    if ((f.crackle -= dt) <= 0) { f.crackle = rnd(0.08, 0.25); noiseSfx(0.05, rnd(900, 2600), 0.1 / (1 + d * 0.15)); }
    if (f.t >= f.life) { freeGroup(f.g); fires.splice(i, 1); }
  }
}
// The path a throw would take, shown while G is held.
const arc = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(240 * 3), 3)), new THREE.PointsMaterial({ color: 0xffe2a0, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.85, depthTest: false }));
const arcEnd = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
arc.frustumCulled = false; arc.visible = arcEnd.visible = false; arcEnd.rotation.x = -Math.PI / 2; arc.renderOrder = arcEnd.renderOrder = 5; scene.add(arc, arcEnd);
let aiming = false;
function stopAiming() { aiming = false; arc.visible = arcEnd.visible = false; }
function updateArc() {
  const E = EQUIP[act.eq];
  if (aiming && (!srv.al || !srv.eq || phase !== 'play' || !E.thrown)) stopAiming();
  if (!aiming) return;
  const n = nadeStart(me, me.yaw, me.pitch, E), p = arc.geometry.attributes.position, side = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  let i = 0, t = 0;
  for (; i < 240 && t < Math.min(E.fuse, 3); i++) {
    const off = Math.max(0, 0.25 - t);   // starts at the hand instead of inside the eye
    p.setXYZ(i, n.x + side.x * off, n.y - off * 0.6, n.z + side.z * off);
    let hit = false;
    for (let k = 0; k < 2; k++) { hit = stepNade(n, NADE_DT, BOXES) || hit; t += NADE_DT; if (hit && (E.impact || E.sticky)) break; }
    if ((hit && (E.impact || E.sticky)) || (Math.hypot(n.vx, n.vz) < 0.2 && hit)) { i++; break; }
  }
  arc.geometry.setDrawRange(0, i); p.needsUpdate = true;
  arcEnd.position.set(n.x, n.y, n.z);
  arc.visible = arcEnd.visible = true;
}
let blindEnd = 0, blindMax = 1;   // real time, so a slow screen is not blind for longer
const smokes = [];   // { g, t, life }
function smokeModel(n = 22) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: i % 2 ? 0xc6c9c4 : 0xa9ada8, transparent: true, depthWrite: false, rotation: Math.random() * 6 }));
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 2.3;
    m.userData = { x: Math.cos(a) * r, y: rnd(0.3, 2.6), z: Math.sin(a) * r, s: rnd(2.6, 3.8), w: rnd(-0.15, 0.15) };
    g.add(m);
  }
  return g;
}
function addSmoke(p, life) {
  const g = smokeModel();
  g.position.set(p.x, p.y, p.z); scene.add(g);
  smokes.push({ g, t: 0, life });
}
/* ---------------- medkits that fall onto the land ---------------- */
const kits = new Map();   // id -> { g, y, land }
const kitGlow = new THREE.SpriteMaterial({ map: puffTex, color: 0x5fff7a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
function kitAdd(m) {
  if (kits.has(m.id)) return;
  const g = new THREE.Group(), box = bake(buildEquip('med'));
  box.scale.setScalar(3); g.add(box);
  const glow = new THREE.Sprite(kitGlow); glow.scale.setScalar(1.6); glow.position.y = 0.1; g.add(glow);
  g.position.set(m.p[0], m.p[1] + 0.4, m.p[2]); scene.add(g);
  kits.set(m.id, { g, y: m.p[1], land: nowS() + (m.f || 0) });
}
function kitGone(m) {
  const q = kits.get(m.id);
  if (q) { scene.remove(q.g); dispose(q.g.children[0]); kits.delete(m.id); }
  if (m.by && m.by === myId) { blip(520, 0.12, 0.08, 'triangle'); blip(700, 0.16, 0.08, 'triangle', 0.12); blip(880, 0.2, 0.07, 'triangle', 0.24); airText('Medkit  +' + DROP.heal + ' health'); }
}
function clearKits() { for (const id of [...kits.keys()]) kitGone({ id }); }
function updateKits(t) {
  for (const q of kits.values()) {
    const k = Math.max(0, (q.land - t) / DROP.fall);   // falls from the sky, then floats and turns
    q.g.position.y = q.y + 0.45 + Math.sin(t * 2.5) * 0.08 + k * k * 16;
    q.g.rotation.y = t * 1.6;
  }
}
function clearThrown() {
  war.clear(); airText(''); clearKits();
  for (const id of [...nades.keys()]) nadeGone(id);
  for (const f of fires.splice(0)) freeGroup(f.g);
  stopAiming(); blindEnd = 0;
  for (const s of smokes.splice(0)) { scene.remove(s.g); for (const m of s.g.children) m.material.dispose(); }
}
function updateThrown(dt) {
  for (const [id, q] of nades) {
    if (q.stuck) { if (q.light) q.light.material.opacity = Math.sin(nowS() * 9) > 0 ? 0.9 : 0.15; continue; }
    const E = EQUIP[q.w];
    for (q.acc += dt; q.acc >= NADE_DT; q.acc -= NADE_DT) if (!q.held && stepNade(q.n, NADE_DT, BOXES) && (E.sticky || E.impact)) q.held = true;   // waits for the server's word
    q.g.position.set(q.n.x, q.n.y, q.n.z);
    const v = q.held ? 0 : Math.hypot(q.n.vx, q.n.vz); q.g.rotation.x += v * dt * 1.4; q.g.rotation.z += v * dt * 0.7;
    if ((q.left -= dt) <= 0) nadeGone(id);   // its end was missed
  }
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]; s.t += dt;
    const grow = Math.min(1, s.t / 1.1), k = 0.35 + 0.65 * (1 - (1 - grow) ** 2), fade = Math.min(1, grow * 1.5, Math.max(0, (s.life - s.t) / 2));
    for (const m of s.g.children) { const u = m.userData; m.position.set(u.x * k, u.y * k, u.z * k); m.scale.setScalar(u.s * k); m.material.opacity = 0.85 * fade; m.material.rotation += u.w * dt; }
    if (s.t >= s.life) { scene.remove(s.g); for (const m of s.g.children) m.material.dispose(); smokes.splice(i, 1); }
  }
  updateFires(dt);
  blastLight.intensity *= 1 - Math.min(1, dt * 12);
  shake = Math.max(0, shake - dt * 0.12);
}

/* ---------------- audio ---------------- */
let AC = null, master = null, nbuf = null;
function audio() {   // made behind the menu, because opening the sound device takes a while; a click then lets it play
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => {}); return; }
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
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = (WEAPONS[w]?.heavy ? 2600 : WEAPONS[w]?.slot === 2 ? 4200 : 3400) / (1 + dist * 0.03);
  const s = AC.createBufferSource(); s.buffer = nbuf;
  const g = AC.createGain(), dur = w === 'sniper' ? 0.55 : WEAPONS[w]?.heavy ? 0.28 : 0.18;
  g.gain.setValueAtTime(0.55 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(lp).connect(g).connect(P); s.start(t, Math.random() * 0.4); s.stop(t + dur);
  const o = AC.createOscillator(), og = AC.createGain();
  o.frequency.setValueAtTime(WEAPONS[w]?.heavy ? 110 : 150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
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

/* ---------------- war fronts ---------------- */
const war = createWar({
  scene, tracer: (a, b) => tracer(a.clone(), b.clone()),
  audio: () => AC && { AC, master, noise: nbuf },
  shot: (dist, pan) => shotSfx('battle', dist, pan),
  boom(dist, pan) { const v = 1 / (1 + dist * 0.04); shotSfx('sniper', dist * 0.35, pan); noiseSfx(1.1, 110, 0.9 * v); noiseSfx(0.7, 320, 0.5 * v, 0.03); },
  shake(v) { if (inGame) shake = Math.max(shake, v); },
});
let airT = 0;
function airText(s, enemy) { airT = s ? 4.5 : 0; const e = $('airWarn'); e.textContent = s; e.hidden = !s; e.classList.toggle('enemy', !!enemy); }

/* ---------------- game state ---------------- */
let profile = loadProfile();
const kit = () => activeKit(profile);
let net = null, inGame = false, myId = 0, myTeam = 'red', roster = new Map(), snaps = [], offEst = null;
const me = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ground: true, cr: 0, wl: 0, pk: 0, yaw: 0, pitch: 0 };
let sp = 0, srv = { hp: 100, a: 30, r: 150, w: 'rifle', eq: 0, al: 1, rs: 0, rl: 0, pg: 0, pr: 0 }, score = [0, 0], timeLeft = 600, phase = 'play';
let act = { lo: kit().lo, sa: kit().sa, eq: kit().eq }, cur = act.lo, switchT = 0;   // what I carry right now; set by the server at each spawn
let sens = +store.get('hanpan-sens', 1.2) || 1.2;
let stepOff = 0;   // the view follows the feet up a step smoothly
let eyeH = PHYS.eye, adsT = 0, bloom = 0, recoilDebt = 0, nextFire = 0, trigger = false, latch = false, ads = false;
let reloadT = 0, reloadDur = 1, shotTimes = [], deathAt = null, killer = 0, wasAlive = true, stepAcc = 0, inputAcc = 0, lastHurt = 0;
let stance = 0, stanceT = 0, slideT = 0, slideDir = [0, 0], slideNext = 0, holdKneel = store.get('hanpan-hold', '0') === '1';
let leanT = 0, leaveT = 0, leanKnelt = false, leanK = 0, leanX = 0, leanZ = 0, leanUses = +store.get('hanpan-lean', 0) || 0, nearWall = 0, nearAt = 0;
let kick = { z: 0, r: 0 }, sway = { x: 0, y: 0 }, bobT = 0, lockFailed = false;
const others = new Map();
const K = {};

function send(m) { if (net) net.send(m); }

/* ---------------- team voice and chat ---------------- */
const muted = new Set();   // player ids silenced by me, for voice and chat
let voiceOn = store.get('hanpan-voice', '1') === '1';
const voice = createVoice({ sendFrame: f => net?.sendBin?.(f), allowed: id => voiceOn && !muted.has(id) && roster.get(id)?.tm === myTeam });
const battle = createBattle({
  audio: () => AC && { AC, master },
  blocked(a, b) { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); return l > 1 && rayMap(a, d.map(v => v / l), BOXES, l) < l - 0.3; },
});
battle.volume = clampVolume(store.get('hanpan-battle', null));
let chatOpen = false;
function chatLine(name, text, cls) {
  const row = document.createElement('div');
  row.className = cls || '';
  if (name) { const b = document.createElement('b'); b.textContent = name + ': '; row.append(b); }
  row.append(text);
  const log = $('chatLog');
  log.append(row);
  while (log.children.length > 8) log.firstChild.remove();
  setTimeout(() => row.classList.add('old'), 9000);
}
function openChat() {
  chatOpen = true; trigger = ads = false; stopAiming(); voice.stop();
  for (const k in K) K[k] = false;
  $('chatBox').classList.add('open'); $('chatRow').hidden = false; $('chatIn').value = ''; $('chatIn').focus();
}
function closeChat() { chatOpen = false; $('chatBox').classList.remove('open'); $('chatRow').hidden = true; $('chatIn').blur(); }
$('chatIn').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.isComposing || e.keyCode === 229) return;   // Enter that only finishes a Hangul syllable
  if (e.key === 'Enter') { const x = $('chatIn').value.trim(); if (x) send({ t: 'c', x }); closeChat(); e.preventDefault(); }
  if (e.key === 'Escape') closeChat();
  if (e.key === 'Tab') e.preventDefault();
});
$('chatIn').addEventListener('blur', () => { if (chatOpen) closeChat(); });

let talkHint = 0;
function talkKey() {
  if (!net?.sendBin) { if (nowS() - talkHint > 4) { talkHint = nowS(); chatLine('', 'Voice works in online matches.', 'sys'); } return; }
  if (!voiceOn) { if (nowS() - talkHint > 4) { talkHint = nowS(); chatLine('', 'Team voice is off. Turn it on in the main menu.', 'sys'); } return; }
  voice.start();
}
const MIC = { asking: 'Allow the microphone to talk', denied: 'Microphone blocked. Allow it in the browser address bar', nomic: 'No microphone found', failed: 'Microphone could not start' };
let talkCache = '';
function updateTalk() {
  const ids = voice.speakers().filter(id => allowedSpeaker(id)), key = ids.join();
  if (key !== talkCache) {
    talkCache = key;
    $('talk').replaceChildren(...ids.map(id => { const d = document.createElement('div'); d.textContent = pname(id); return d; }));
  }
  const msg = voice.talking ? 'Talking to team' : K.KeyV && voiceOn && net?.sendBin ? MIC[voice.state] || '' : '';
  $('micBox').hidden = !msg; $('micBox').className = voice.talking ? 'live' : '';
  if (msg) setText('micBox', msg);
}
const allowedSpeaker = id => !muted.has(id) && roster.get(id)?.tm === myTeam;
function paintMutes() {
  const mates = [...roster.values()].filter(p => p.tm === myTeam && !p.b && p.id !== myId);
  $('mutes').hidden = !mates.length;
  $('mutes').querySelector('ul').replaceChildren(...mates.map(p => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.textContent = muted.has(p.id) ? 'Unmute' : 'Mute'; b.setAttribute('aria-label', b.textContent + ' ' + p.n);
    b.onclick = () => { if (!muted.delete(p.id)) muted.add(p.id); paintMutes(); };
    li.append(p.n, b);
    return li;
  }));
}

let held = null;   // messages that wait until the land is loaded
function onMsg(m) {
  if (held) { held.push(m); return; }
  if (m.t === 'welcome' && !(m.map === MAP.id && warming?.ready)) {
    const mine = net, queue = held = [];
    setText('center', 'Loading the land…');
    makeReady(m.map).then(() => { if (held !== queue) return; held = null; setText('center', ''); if (net === mine) for (const q of [m, ...queue]) if (net === mine && q.t !== 'pi') onMsg(q); },
      () => { if (held !== queue) return; held = null; if (net === mine) leaveGame('Could not load this land. Try again.'); });
    return;
  }
  switch (m.t) {
    case 'welcome': loadMap(m.map); myId = m.id; myTeam = m.team; buildVM(myTeam); break;
    case 'tp': Object.assign(me, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: 0, vx: 0, vy: 0, vz: 0 }); sp = m.sp; leanEnd(); if (m.lo) { stance = me.cr = stepOff = 0; leanX = leanZ = slideT = 0; stopAiming(); act = { lo: m.lo, sa: m.sa, eq: m.eq }; cur = m.lo; switchT = nowS(); reloadT = 0; vmGun(m.lo); vmGun(m.sa); } break;
    case 's': onSnap(m); break;
    case 'ro': {
      roster = new Map(m.ps.map(p => [p.id, p]));
      const mine = roster.get(myId);
      if (mine && mine.tm !== myTeam) { myTeam = mine.tm; buildVM(myTeam); }
      if (!$('board').hidden) renderBoard();
      for (const id of muted) if (!roster.has(id)) muted.delete(id);
      paintMutes();
      break;
    }
    case 'sh': remoteShot(m); break;
    case 'hit': showHit(m); break;
    case 'dmg': showDmg(m); break;
    case 'k': onKill(m); break;
    case 'rl': battle.reload(); reloadT = reloadDur = m.d; noiseSfx(0.06, 2500, 0.15, 0.1); noiseSfx(0.08, 1800, 0.18, m.d * 0.7); break;
    case 'end': showEnd(m); clearKits(); break;
    case 'hd': kitAdd(m); break;
    case 'hx': kitGone(m); break;
    case 'start': battle.start(); clearThrown(); setText('center', ''); break;
    case 'deny': leaveGame({ check: 'Could not check what you own. Try again in a moment.', fight: 'This fight link has expired. Ask for a new one.', full: 'This fight is full.' }[m.why] || 'You need to own this land to play it online. It is in the Store.'); break;
    case 'lb': showLobby(m); break;
    case 'c': if (!muted.has(m.id)) chatLine(pname(m.id), String(m.x), m.id === myId ? 'me' : ''); break;
    case 'cx': chatLine('', 'You are sending messages too fast.', 'sys'); break;
    case 'gt': battle.thrown(m); nadeThrown(m); if (m.st) nadeStuck({ id: m.id, p: m.o }); break;
    case 'gs': nadeStuck(m); break;
    case 'gx': nadeBurst(m); break;
    case 'air': { const s = war.flight(m); if (s) { airText(s, m.tm !== myTeam); if (m.tm !== myTeam) blip(620, 0.18, 0.06, 'triangle'); } break; }
    case 'ah': war.round(m); break;
    case 'ad': war.down(m); airText((m.by === myId ? 'You' : pname(m.by)) + ' shot down a helicopter', roster.get(m.by)?.tm !== myTeam); break;
    case 'fl': blindMax = Math.max(blindEnd - nowS(), m.s); blindEnd = nowS() + blindMax; blip(3200, Math.min(2.5, m.s), 0.06, 'sine'); stopAiming(); break;
    case 'heal': blip(520, 0.12, 0.08, 'triangle'); blip(700, 0.16, 0.08, 'triangle', 0.12); break;
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
    const gear = roster.get(a[0])?.g || '';
    if (o && (o.team !== team || o.gear !== gear)) { dropSoldier(a[0]); o = null; }
    if (o) setWeapon(o.g, a[8]);
  }
  for (const id of others.keys()) if (!map.has(id)) dropSoldier(id);
}
// New soldiers are dressed one per frame, so a full room does not stop the picture.
function addSoldier() {
  for (const a of snaps.at(-1).map.values()) {
    if (a[0] === myId || others.has(a[0])) continue;
    const team = a[9] ? 'blue' : 'red', gear = roster.get(a[0])?.g || '', g = makeSoldier(team, unpackGear(gear), a[8]);
    scene.add(g);
    others.set(a[0], { g, team, gear, walk: 0, px: a[1], pz: a[3], tag: null, dead: 0, s: { x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], cr: a[6], alive: a[7] } });
    return;
  }
}

function dropSoldier(id) {
  const o = others.get(id);
  if (!o) return;
  scene.remove(o.g);
  if (o.tag) { o.g.remove(o.tag); o.tag.material.map.dispose(); o.tag.material.dispose(); }
  disposeSoldier(o.g);
  others.delete(id);
}
function dropSoldiers() { for (const id of [...others.keys()]) dropSoldier(id); }

function interpRemotes(dt) {
  if (snaps.length < 2 || offEst == null) return;
  addSoldier();
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
    s.wl = B[10] | 0; s.pk = s.wl ? (A[10] === B[10] ? A[11] + (B[11] - A[11]) * k : B[11]) : 0;
    const g = o.g, u = g.userData;
    if (!s.alive) {
      o.dead = Math.min(1, o.dead + dt * 3);
      u.torso.rotation.set(0, 0, 0); u.aim.rotation.z = 0; o.lean = 0;
      g.rotation.set(-Math.PI / 2 * o.dead, s.yaw, 0, 'YXZ');
      g.position.set(s.x, s.y + 0.15 * o.dead, s.z);
      if (o.tag) o.tag.visible = false;
      continue;
    }
    o.pr = (o.pr || 0) + ((s.cr === 2 ? 1 : 0) - (o.pr || 0)) * Math.min(1, dt * 9);
    if (o.dead) { o.dead = 0; o.px = s.x; o.pz = s.z; }
    const sp2 = Math.hypot(s.x - o.px, s.z - o.pz) / Math.max(dt, 1e-3);
    o.px = s.x; o.pz = s.z;
    o.walk += dt * Math.min(sp2, 7) * 1.6;
    const pr = o.pr;                       // 0 upright, 1 lying face down
    g.position.set(s.x + Math.sin(s.yaw) * 0.85 * pr, s.y + 0.16 * pr, s.z + Math.cos(s.yaw) * 0.85 * pr);
    g.rotation.set(-Math.PI / 2 * pr, s.yaw, 0, 'YXZ');
    u.aim.rotation.x = s.pitch + pr * Math.PI / 2; u.head.rotation.x = s.pitch * 0.5 * (1 - pr) + pr * 1.25;
    const sw = Math.sin(o.walk) * Math.min(1, sp2 / 3) * 0.7;
    if (s.cr === 2) {
      u.torso.position.y = 0.9;
      u.legs.forEach((l, i) => { l.position.y = 0.9; l.rotation.x = 0; l.rotation.z = (i ? 1 : -1) * (0.14 + sw * 0.1); l.userData.knee.rotation.x = -Math.max(0, i ? sw : -sw) * 0.8; });
    } else if (s.cr) {
      u.torso.position.y = 0.55;
      u.legs.forEach((l, i) => { l.position.y = 0.55; l.rotation.z = 0; l.rotation.x = i ? 0.05 + sw * 0.3 : 1.35 - sw * 0.3; l.userData.knee.rotation.x = i ? -1.5 : -1.35; });   // one knee on the ground
    } else {
      u.torso.position.y = 0.9;
      u.legs.forEach((l, i) => { l.position.y = 0.9; l.rotation.z = 0; l.rotation.x = i ? sw : -sw; l.userData.knee.rotation.x = -Math.max(0, (i ? -sw : sw)) * 1.1; });
    }
    poseLean(o, s, dt, sp2, pr);
    const mate = o.team === myTeam;
    if (mate && !o.tag) { const p = roster.get(id); if (p) { o.tag = nameTag(p.n, '#9fe0ff'); g.add(o.tag); } }
    if (o.tag) { o.tag.visible = mate; o.tag.position.set(0, 2.15 - 1.2 * pr, 0.85 * pr); }
  }
}

// Back (or shoulder) on the wall; the upper body leans out along it.
function poseLean(o, s, dt, sp2, pr) {
  const u = o.g.userData, w = s.cr === 2 ? null : WALL[s.wl];
  if (w) { o.wall = w; o.pk = s.pk; } else o.pk = (o.pk || 0) * (1 - Math.min(1, dt * 10));
  o.lean = (o.lean || 0) + ((w ? 1 : 0) - (o.lean || 0)) * Math.min(1, dt * 10);
  if (o.lean < 0.01) { if (u.torso.rotation.x || u.torso.rotation.z) { u.torso.rotation.set(0, 0, 0); u.aim.rotation.z = 0; } return; }
  const [wx, wz] = o.wall, [tx, tz] = alongWall(o.wall), k = o.lean, pk = o.pk, a = Math.abs(pk), sn = Math.sin(s.yaw), cs = Math.cos(s.yaw);
  const back = Math.max(0, wx * sn + wz * cs), hunch = s.cr === 1 ? 0.5 * (1 - a) : 0;   // back: 1 with the back to the wall
  o.g.position.x += (tx * pk * 0.26 + wx * 0.07) * k; o.g.position.z += (tz * pk * 0.26 + wz * 0.07) * k;
  const dx = tx * pk * 0.5 + wx * 0.1 * back * (1 - a), dz = tz * pk * 0.5 + wz * 0.1 * back * (1 - a);
  const side = (dx * cs - dz * sn) * k, rear = (dx * sn + dz * cs - hunch) * k * (1 - pr);
  u.torso.rotation.set(rear, 0, -side);
  u.aim.rotation.x -= rear; u.aim.rotation.z = side * 0.8; u.head.rotation.x -= rear * 0.6;
  if (s.cr === 1) {
    const low = k * (1 - a);
    u.torso.position.y -= 0.15 * low;
    u.legs.forEach((l, i) => { l.position.y -= 0.15 * low; l.rotation.x += (i ? -0.55 : 0.33) * low; l.userData.knee.rotation.x += (i ? 0.43 : -0.33) * low; });
  } else if (back > 0.5 && sp2 < 0.4 && a < 0.3) { u.legs[0].rotation.x = 0.5 * k; u.legs[0].userData.knee.rotation.x = -1.25 * k; }   // one foot on the wall
}

/* ---------------- shooting ---------------- */
function curSpread() {
  const W = WEAPONS[cur], hs = Math.hypot(me.vx, me.vz);
  let s = W.spread.hip + (W.spread.ads - W.spread.hip) * adsT + W.spread.move * clamp(hs / PHYS.walk, 0, 1.3) + (me.ground ? 0 : 0.06) + bloom;
  s *= [1, 0.7, 0.5][me.cr] * (me.wl ? 0.85 : 1);   // a wall steadies you
  return s;
}
function ammoShown() {
  const lag = srv.pg / 1000 + 0.08, t = nowS();
  shotTimes = shotTimes.filter(x => t - x < lag + 0.05);
  return Math.max(0, srv.a - shotTimes.filter(x => t - x < lag).length);
}
function tryFire() {
  const W = WEAPONS[cur], t = nowS();
  if (!srv.al || phase !== 'play' || aiming || slideT > 0 || reloadT > 0 || t < nextFire || t - switchT < 0.35) return;
  if (ammoShown() <= 0) { if (srv.r > 0) { send({ t: 'r' }); nextFire = t + 0.4; } else blip(900, 0.05, 0.05); return; }
  if (!W.auto) { if (latch) return; latch = true; }
  nextFire = t + W.rate;
  const s = curSpread(), yaw = me.yaw + gauss() * s, pitch = me.pitch + gauss() * s;
  send({ t: 'f', yaw, pitch });
  shotTimes.push(t);
  bloom = Math.min(W.spread.max, bloom + W.spread.bloom);
  const kv = W.recoil.v * (1 - 0.4 * adsT) * [1, 0.8, 0.6][me.cr];
  me.pitch = clamp(me.pitch + kv, -1.5, 1.5); me.yaw += gauss() * W.recoil.h; recoilDebt += kv * 0.55;
  const hard = W.recoil.v >= 0.045;
  kick.z = hard ? 0.12 : 0.05; kick.r = hard ? 0.18 : 0.07;
  muzzle.visible = !(W.scope && adsT > 0.9); muzzle.material.rotation = Math.random() * 6; muzzle.userData.t = 0.045;
  flashLight.intensity = 6; vmFlashLight.intensity = 2;
  shotSfx(cur);
  // local prediction of where the bullet lands (the server decides hits)
  const eye = new THREE.Vector3(me.x + leanX, me.y + eyeH, me.z + leanZ), d = dirFrom(yaw, pitch), o = [eye.x, eye.y, eye.z], n = [0, 0, 0];
  const from = cam.localToWorld(V.set(adsT > 0.5 ? 0 : 0.25, adsT > 0.5 ? -0.08 : -0.2, -2)).clone();
  for (let i = 0; i < (W.pellets || 1); i++) {
    if (W.pellets) d.splice(0, 3, ...dirFrom(yaw + rnd(-W.pelletSpread, W.pelletSpread), pitch + rnd(-W.pelletSpread, W.pelletSpread)));
    let tt = rayMap(o, d, BOXES, W.range, n), victim = false;
    for (const [id, q] of others) { if (!q.s.alive || q.team === myTeam) continue; const h = hitbox(o, d, q.s); if (h.t < tt) { tt = h.t; victim = true; aimedAt = id; aimedT = t; } }
    const end = new THREE.Vector3(o[0] + d[0] * tt, o[1] + d[1] * tt, o[2] + d[2] * tt);
    if (W.slot === 1 || Math.random() < 0.5) tracer(from, end);
    if (victim) puff(end, 0x7a1f14, 0.3, 0.35); else if (tt < W.range && !(MAP.theme.front?.sea != null && end.z < 0.1 - MAP.size[1])) impact(end, n);   // nothing to hit out at sea
  }
}
function remoteShot(m) {
  const o = new THREE.Vector3(...m.o), e = new THREE.Vector3(...m.e);
  const q = others.get(m.id);
  battle.shot(m, WEAPONS[m.w]);
  if (q) { const l = leanOff(q.s); o.set(q.s.x + l.x, q.s.y + [1.4, 1, 0.4][q.s.cr] + l.y, q.s.z + l.z); q.lastShot = nowS(); }
  tracer(o, e);
  if (!m.hit) impact(e, null);
  for (const p of m.m || []) { const x = new THREE.Vector3(...p); tracer(o, x); if (!m.hit) impact(x, null); }
  const dx = o.x - me.x, dz = o.z - me.z, dist = Math.hypot(dx, dz);
  shotSfx(m.w, dist, -Math.sin(wrapA(Math.atan2(-dx, -dz) - me.yaw)));
}

/* ---------------- HUD events ---------------- */
let hitT = 0, dmgT = 0, vignT = 0, aimedAt = 0, aimedT = 0;   // the last enemy a bullet of mine seemed to reach, and when
function showHit(m) {
  const h = $('hitm'); h.className = m.kill ? 'kill' : ''; hitT = 0.22;
  blip(m.head ? 2400 : 1700, 0.05, 0.08);
  if (!m.kill && nowS() - aimedT < 0.5) battle.hitEnemy(aimedAt);
  if (m.kill) { blip(880, 0.08, 0.1, 'triangle', 0.06); blip(1320, 0.12, 0.1, 'triangle', 0.14); }
}
function showDmg(m) {
  const rel = wrapA(Math.atan2(-(m.from[0] - me.x), -(m.from[1] - me.z)) - me.yaw);
  $('dmgdir').style.transform = `rotate(${-rel}rad)`; dmgT = 1; vignT = 0.6; lastHurt = nowS();
  if (m.hp > 0) battle.hurt();
  noiseSfx(0.12, 600, 0.25);
}
const pname = id => roster.get(id)?.n || 'Unknown';
function onKill(m) {
  battle.kill(m);
  const kp = roster.get(m.k), vp_ = roster.get(m.v);
  const row = document.createElement('div');
  if (m.k === myId || m.v === myId) row.className = 'me';
  const a = document.createElement('span'); a.className = kp?.tm === 'red' ? 'r' : 'b'; a.textContent = kp ? kp.n : '';
  const w = document.createElement('em'); w.textContent = (WEAPONS[m.w]?.name || EQUIP[m.w]?.name || AIR_NAMES[m.w] || '') + (m.hs ? ' · headshot' : '');
  const b = document.createElement('span'); b.className = vp_?.tm === 'red' ? 'r' : 'b'; b.textContent = vp_ ? vp_.n : '';
  row.append(a, w, b);
  const feed = $('feed'); feed.prepend(row); while (feed.children.length > 6) feed.lastChild.remove();
  setTimeout(() => row.remove(), 6000);
  if (net?.online) {
    if (m.v === myId) addRecord({ deaths: 1 });
    else if (m.k === myId) addRecord({ kills: 1, heads: m.hs ? 1 : 0 });
  }
  if (m.v === myId) { deathAt = { x: me.x, y: me.y + eyeH, z: me.z }; killer = m.k; noiseSfx(0.4, 300, 0.3); }
}
function showEnd(m) {
  const mine = m.winner === myTeam, c = $('center');
  battle.end();
  if (net?.online) addRecord({ matches: 1, wins: mine ? 1 : 0 });
  for (const id of [...nades.keys()]) nadeGone(id);
  c.textContent = ''; hudCache.center = null;
  const b = document.createElement('span'); b.className = 'big';
  b.textContent = m.winner === 'draw' ? 'DRAW' : mine ? 'VICTORY' : 'DEFEAT';
  c.append(b, `Red ${m.score[0]}  :  ${m.score[1]} Blue\n${m.left ? 'The other team left. ' : ''}${m.fight ? 'Rematch in 10 seconds if everyone stays' : 'Next match in 10 seconds'}`);
}
// Private fight: who is missing before it starts.
function showLobby(m) {
  phase = 'wait';
  const need = m.n * 2 - m.r - m.b, size = `${m.n} vs ${m.n}`;
  setText('center', m.go ? `${size} · starting in ${m.go}` :
    `Private fight ${size}\nRed ${m.r}/${m.n} · Blue ${m.b}/${m.n} · waiting for ${need} more\nPress T to change team`);
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
  const hill = BOXES.slopes;
  if (hill) { mg.fillStyle = 'rgba(216,201,163,.07)'; for (const b of hill) mg.fillRect(b.min[0], b.min[2], b.max[0] - b.min[0], b.max[2] - b.min[2]); mg.fillStyle = 'rgba(216,201,163,.55)'; }
  for (const b of BOXES) if (b.kind !== 'slope' && b.min[0] < me.x + 33 && b.max[0] > me.x - 33 && b.min[2] < me.z + 33 && b.max[2] > me.z - 33 && b.min[1] < 2 + (hill ? groundAt(BOXES, (b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2) : 0)) mg.fillRect(b.min[0], b.min[2], b.max[0] - b.min[0], b.max[2] - b.min[2]);
  const t = nowS();
  mg.lineWidth = 0.4; mg.strokeStyle = '#ff5a3c'; mg.fillStyle = 'rgba(255,90,60,.22)';
  for (const [x, z] of war.bombs()) { mg.beginPath(); mg.arc(x, z, 4, 0, 7); mg.fill(); mg.stroke(); }
  mg.fillStyle = '#5fff7a';
  for (const q of kits.values()) { const { x, z } = q.g.position; mg.fillRect(x - 1.5, z - 0.5, 3, 1); mg.fillRect(x - 0.5, z - 1.5, 1, 3); }
  mg.lineWidth = 0.7;
  for (const [x, z, tm] of war.helis()) { mg.strokeStyle = tm === myTeam ? '#7fd3ff' : '#ff5a3c'; mg.beginPath(); mg.moveTo(x - 1.6, z - 1.6); mg.lineTo(x + 1.6, z + 1.6); mg.moveTo(x + 1.6, z - 1.6); mg.lineTo(x - 1.6, z + 1.6); mg.stroke(); }
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
  if (!inGame || ['INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && $('pauseOv').hidden) { e.preventDefault(); openChat(); return; }
  if (e.code === 'KeyV' && !e.repeat) talkKey();
  K[e.code] = true;
  if (e.code === 'Tab') { e.preventDefault(); renderBoard(); $('board').hidden = false; }
  if (e.code === 'KeyR') send({ t: 'r' });
  if (e.code === 'KeyT' && !e.repeat && phase === 'wait') send({ t: 'tm' });   // private fight lobby: change team
  if (e.code === 'KeyG' && !e.repeat && srv.al && phase === 'play') {
    if (!EQUIP[act.eq].thrown || myCharge()) send({ t: 'g', yaw: me.yaw, pitch: me.pitch });   // med kit, or blow the charge
    else if (srv.eq > 0) { aiming = true; trigger = ads = false; }
  }
  if (!e.repeat && srv.al) {
    if (e.code === 'KeyF') leanKey();
    if (e.code === 'Space' && me.wl) { leanEnd(); K.Space = false; }   // Space steps off the wall
    if (e.code === 'KeyC' && !leanKnelt) kneelKey();
    if (e.code === 'KeyX') setStance(stance === 2 ? 0 : 2);
    if (e.code === 'Space' && stance) { setStance(0); K.Space = false; }   // Space stands up first
  }
  for (const [key, w] of [['Digit1', act.lo], ['Digit2', act.sa]]) {
    if (e.code === key && cur !== w) { cur = w; switchT = nowS(); reloadT = 0; send({ t: 'w', w }); }
  }
  if (e.code === 'Space') e.preventDefault();
});
// F: lean on the wall beside you, or step away from it.
function leanKey() {
  if (me.wl) { leanEnd(); return; }
  if (!me.ground || stance === 2 || slideT > 0 || phase !== 'play') return;
  const wl = findWall(me, BOXES);
  if (!wl) return;
  me.wl = wl; me.pk = 0; leanT = nowS(); leaveT = 0;
  if (leanUses < 5) store.set('hanpan-lean', ++leanUses);
  noiseSfx(0.16, 420, 0.08);
}
function leanEnd() {
  if (leanKnelt) { leanKnelt = false; stance = 0; stanceT = nowS(); }
  me.wl = me.pk = 0;
}
// One frame against the wall. Takes the wished direction; returns the direction to move, or null when the player left the wall.
function leanMove(ix, iz, dt) {
  const w = WALL[me.wl], T = alongWall(w), reach = nowS() - leanT < 0.6 ? 0.65 : 0.35;   // the first moments are spent getting there
  const into = ix * w[0] + iz * w[1];
  leaveT = into < -0.75 ? leaveT + dt : 0;
  if (!me.ground || stance === 2 || me.cr === 2 || slideT > 0 || leaveT > 0.15 || !wallAt(me, me.wl, BOXES, reach)) { leanEnd(); return null; }
  const ends = (side, d) => !wallAt(me, me.wl, BOXES, reach, side * d);
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), face = fx * w[0] + fz * w[1], look = fx * T[0] + fz * T[1], aimIn = ads || aiming;
  const want = ix * T[0] + iz * T[1];
  let move = Math.abs(want) > 0.35 ? want : 0, out = 0;
  // low wall: stay down behind it, rise to look over
  const low = lowWall(me, me.wl, BOXES, reach), rise = low && !move && (into > 0.5 || (aimIn && face > 0.5));
  if (low) { leanKnelt = true; stance = rise ? 0 : 1; } else if (leanKnelt) { leanKnelt = false; stance = 0; }
  if (move && ends(Math.sign(move), 0.34)) { out = Math.sign(move); move = 0; }
  else if (!move && aimIn && !rise && face > -0.5) {   // aiming near a corner: go to the corner and lean out
    const sides = [1, -1].filter(q => ends(q, 0.9) && q * look > -0.35);
    const q = me.pk && sides.includes(Math.sign(me.pk)) ? Math.sign(me.pk) : sides.length > 1 ? (look < 0 ? -1 : 1) : sides[0];
    if (q) { if (ends(q, 0.34)) out = q; else move = q; }
  }
  if (!move) {
    for (const q of [1, -1]) if (ends(q, 0.28) && !ends(-q, 0.4)) move = -q * 0.5;   // no elbow past the corner
    if (!move) { me.vx *= Math.abs(w[0]); me.vz *= Math.abs(w[1]); }
  }
  const to = out ? out * peekRoom(me, me.wl, out, BOXES) : 0;
  me.pk += clamp(to - me.pk, -dt * 6, dt * 6);
  return [T[0] * move + w[0] * 0.6, T[1] * move + w[1] * 0.6];
}
// C: kneel or stand up. While sprinting it becomes a slide that ends on one knee.
function kneelKey() {
  if (stance === 0 && K.ShiftLeft && K.KeyW && me.ground && Math.hypot(me.vx, me.vz) > 5.8 && nowS() > slideNext) {
    const v = Math.hypot(me.vx, me.vz);
    slideDir = [me.vx / v, me.vz / v]; slideT = 0.65; slideNext = nowS() + 1.6; noiseSfx(0.5, 500, 0.14);
    setStance(1);
  } else if (holdKneel) setStance(1); else setStance(stance === 1 ? 0 : 1);
}
function setStance(want) {
  const t = nowS();
  if (t - stanceT < 0.25 || (want === 2 && !me.ground)) return;
  stance = want; stanceT = t;
  if (want !== 1) slideT = 0;
  noiseSfx(0.12, 380, 0.07);
}
addEventListener('keyup', e => {
  if (e.code === 'KeyG' && aiming) { stopAiming(); send({ t: 'g', yaw: me.yaw, pitch: me.pitch }); }
  if (e.code === 'KeyC' && holdKneel && stance === 1) { stance = 0; stanceT = 0; }
  K[e.code] = false; if (e.code === 'KeyV') voice.stop(); if (e.code === 'Tab') $('board').hidden = true; });
addEventListener('blur', () => { for (const k in K) K[k] = false; trigger = false; ads = false; stopAiming(); voice.stop(); });
canvas.addEventListener('mousedown', e => {
  if (!inGame) return;
  if (chatOpen) { e.preventDefault(); return; }
  if (document.pointerLockElement !== canvas && !lockFailed) { lock(); return; }
  audio();
  if (e.button === 0) { trigger = true; latch = false; }
  if (e.button === 2) { if (aiming) stopAiming(); else ads = true; }   // right click cancels a throw
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
  if (document.pointerLockElement !== canvas && chatOpen) closeChat();
  if (document.pointerLockElement !== canvas) stopAiming();
  $('pauseOv').hidden = document.pointerLockElement === canvas;
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; $('pauseOv').hidden = true; });

/* ---------------- getting ready ---------------- */
// The first time anything is drawn, its shader has to be built. Doing all of that behind the menu keeps the match itself smooth.
const nextFrame = () => new Promise(r => { requestAnimationFrame(r); setTimeout(r, 150); });   // a hidden page gets no frames
const within = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
let samples = null;   // one of everything a match can show; never freed, because a shader goes away with its last user
function makeSamples() {
  const g = new THREE.Group();
  g.add(makeSoldier('red', { camo: 'woodland', helmet: 'assault', vest: 'heavy', finish: 'tiger' }, 'rifle'), makeSoldier('blue', {}, 'sniper'));
  for (const k in EQUIP) g.add(bake(buildEquip(k)));
  const mark = new THREE.InstancedMesh(decals.geometry, decals.material.clone(), 1), dots = new THREE.Points(arc.geometry, arc.material.clone()), fire = fireModel();
  mark.setMatrixAt(0, new THREE.Matrix4());
  dots.material.opacity = 0;
  for (const f of fire.children) if (f.isInstancedMesh) for (let i = 0; i < f.count; i++) { f.setMatrixAt(i, new THREE.Matrix4()); f.setColorAt(i, FLAME[0]); }
  g.add(fire, smokeModel(1), mark, dots, nameTag('', '#fff'));
  for (const m of [tracers[0], puffs[0], arcEnd]) { const c = m.clone(); c.material = m.material.clone(); c.visible = true; g.add(c); }
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}
const warmed = new Set();
let tried = 0, built = false, warming = null;   // { id, drawable: shaders are built, ready: a match may start, done }
function warm() {
  if (warming?.id === MAP.id) return warming.done;
  const w = warming = { id: MAP.id, drawable: warmed.has(MAP.id), ready: warmed.has(MAP.id), done: null };
  w.done = w.ready ? Promise.resolve() : warmUp(w).catch(e => console.warn('[warm]', e)).then(() => { w.drawable = w.ready = true; });
  return w.done;
}
async function warmUp(w) {
  samples ||= makeSamples();
  buildVM(myTeam);
  await within(Promise.all([R.compileAsync(scene, cam), R.compileAsync(samples, cam, scene), R.compileAsync(vmScene, vmCam)]), 8000);
  w.drawable = true;
  // then drawn once, too small to see, a few things per frame
  const spot = new THREE.Group(), list = [...samples.children], hands = [muzzle, ...Object.values(VMS).map(v => v.g)].map(o => [o, o.visible]);
  spot.scale.setScalar(1e-4); scene.add(spot);
  vmRoot.scale.setScalar(1e-4); vmRoot.position.z = -1;
  for (const [o] of hands) o.visible = true;
  try {
    for (let i = 0; i < list.length && warming === w; i += 3) {
      spot.position.copy(cam.getWorldDirection(V)).multiplyScalar(3).add(cam.position);
      spot.add(...list.slice(i, i + 3));
      await nextFrame();
      if (i === 0) { R.clearDepth(); R.render(vmScene, vmCam); }
      await nextFrame();
      spot.clear();
    }
    for (; tried < 9 && warming === w; tried++) {   // every piece of gear once: its shapes are kept, so soldiers in the match are dressed faster
      disposeSoldier(makeSoldier('red', Object.fromEntries(SLOTS.map(s => [s, itemsOf(s)[tried % itemsOf(s).length]])), PRIMARIES[tried % PRIMARIES.length]));
      await nextFrame();
    }
    if (!inGame && !warmed.size) {   // the screen panels and the hurt flash too, nearly see-through
      const faint = ['vign', 'dmgdir', 'blind', 'nadeWarn'].map($), warn = $('nadeWarn').hidden;
      Object.assign($('hud').style, { opacity: 0.01, zIndex: 99 }); $('hud').hidden = $('nadeWarn').hidden = false;
      for (const e of faint) e.style.opacity = 0.9;
      for (let i = 0; i < 3; i++) await nextFrame();
      for (const e of faint) e.style.opacity = '';
      $('hud').style.opacity = $('hud').style.zIndex = ''; $('hud').hidden = !inGame; $('nadeWarn').hidden = warn;
    }
    if (warming === w) warmed.add(w.id);
  } finally {
    samples.add(...list); spot.removeFromParent();
    vmRoot.scale.setScalar(1); vmRoot.position.z = 0;
    for (const [o, v] of hands) o.visible = v;
  }
}
// Loads a land and waits until a match on it can start smoothly. 'any' is whatever the server picks.
async function makeReady(id) {
  if (id !== 'any') { await ensureMap(id); loadMap(id); }
  while (!warming.ready) await warm();   // another land may have been chosen meanwhile
}
(window.requestIdleCallback || setTimeout)(() => { audio(); voice.ready(); });

/* ---------------- menu ---------------- */
$('nameIn').value = loadName();
const sensIn = $('sensIn'); sensIn.value = sens; $('sensOut').textContent = sens.toFixed(1);
sensIn.oninput = () => { sens = +sensIn.value; $('sensOut').textContent = sens.toFixed(1); store.set('hanpan-sens', sens); };
$('holdKneel').checked = holdKneel;
$('holdKneel').onchange = () => { holdKneel = $('holdKneel').checked; store.set('hanpan-hold', holdKneel ? '1' : '0'); };
$('voiceOn').checked = voiceOn;
$('voiceOn').onchange = () => { voiceOn = $('voiceOn').checked; store.set('hanpan-voice', voiceOn ? '1' : '0'); };
// Battle sounds: the same slider is in the main menu and on the pause screen.
function paintBattle() {
  const n = Math.round(battle.volume * 100);
  for (const i of document.querySelectorAll('input[data-battle]')) i.value = n;
  for (const o of document.querySelectorAll('output[data-battle]')) o.textContent = n ? n + '%' : 'Off';
}
for (const i of document.querySelectorAll('input[data-battle]')) i.oninput = () => { battle.volume = i.value / 100; store.set('hanpan-battle', battle.volume); paintBattle(); };
paintBattle();
let owned = new Set();
const locked = product => !!product && !owned.has(product);
// The same weapon choices are in the main menu and on the pause screen.
const PICKS = { lo: PRIMARIES, sa: SIDEARMS, eq: Object.keys(EQUIP) };
for (const s of document.querySelectorAll('select[data-pick]')) {
  for (const id of PICKS[s.dataset.pick]) { const o = document.createElement('option'); o.value = id; s.append(o); }
  s.onchange = () => {
    kit()[s.dataset.pick] = s.value; saveProfile(profile); paintLo();
    if (inGame) { send({ t: 'lo', lo: kit().lo, sa: kit().sa, eq: kit().eq }); setText('kitNote', 'You get this at your next spawn.'); }
  };
}
function paintLo() {
  for (const s of document.querySelectorAll('select[data-pick]')) {
    for (const o of s.options) {
      const item = WEAPONS[o.value] || EQUIP[o.value];
      o.textContent = item.name + (locked(item.product) ? ' (locked online)' : '');
      o.disabled = inGame && !!net?.online && locked(item.product);
    }
    s.value = kit()[s.dataset.pick];
  }
  $('kitSeg').replaceChildren(...profile.kits.map((k, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Kit ' + (i + 1); b.setAttribute('aria-pressed', i === profile.active);
    b.onclick = () => { profile.active = i; saveProfile(profile); paintLo(); paintPortrait(); $('kitSeg').children[i].focus(); };
    return b;
  }));
}
function paintPortrait() {
  try {
    const m = makeSoldier('red', kit().gear, kit().lo);
    snap($('portrait'), m, { view: 'bust' });
    disposeSoldier(m); closeStudio();
  } catch (e) { console.warn('[portrait]', e); }
}
paintLo();
paintPortrait();
addEventListener('pageshow', e => { if (e.persisted) { profile = loadProfile(); $('nameIn').value = loadName(); paintLo(); paintPortrait(); } });
let land = store.get('hanpan-land', DEFAULT_MAP);
if (land !== 'any' && !isMap(land)) land = DEFAULT_MAP;
const LANDS = [...MAP_LIST].sort((a, b) => b.city - a.city);
for (const { id, name, desc, product, city } of [...LANDS, { id: 'any', name: 'Any land', desc: 'Join the busiest match' }]) {
  const b = document.createElement('button'), n = document.createElement('b'), d = document.createElement('small');
  b.type = 'button'; b.dataset.land = id; b.dataset.group = id === 'any' ? 'all' : city ? 'city' : 'field'; n.textContent = name; d.textContent = desc;
  if (id === 'any') { const q = document.createElement('span'); q.className = 'any'; q.textContent = '?'; q.ariaHidden = 'true'; b.append(q); } else b.append(floorPlan(getMap(id)));
  if (product) { const l = document.createElement('i'); l.className = 'lock'; b.append(l); b.dataset.product = product; }
  b.append(n, d); $('landSeg').append(b);
}
let landTab = land !== 'any' && !MAP_LIST.find(m => m.id === land).city ? 'field' : 'city';
$('landTabs').onclick = e => { const b = e.target.closest('button'); if (b) { landTab = b.dataset.tab; paintLand(); } };
function showLand(id) {
  if (isReady(id)) { loadMap(id); return; }
  status('Loading the city…');
  ensureMap(id).then(() => { if (land === id && !inGame) { status(''); loadMap(id); } }, () => { if (land === id && !inGame) status('Could not load this land. Check your connection and choose it again.'); });
}
function paintLand() {
  for (const b of $('landTabs').children) b.setAttribute('aria-pressed', b.dataset.tab === landTab);
  for (const b of $('landSeg').children) {
    b.hidden = b.dataset.group !== 'all' && b.dataset.group !== landTab;
    b.setAttribute('aria-pressed', b.dataset.land === land);
    const l = b.querySelector('.lock'), no = locked(b.dataset.product);
    b.classList.toggle('locked', no);
    if (l) l.textContent = no ? 'Locked' : 'Owned';
  }
  if (land !== 'any' && !inGame) showLand(land);   // show the chosen land behind the menu
}
$('landSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; land = b.dataset.land; store.set('hanpan-land', land); paintLand(); };
const status = t => { $('status').textContent = t; };
loadMap(isReady(land) ? land : DEFAULT_MAP);
paintLand();
built = true; warm();
// wallet login (optional; guests can always play)
function paintAccount(user) {
  const box = $('account');
  box.textContent = '';
  if (!configured) return;
  const shop = document.createElement('a');
  shop.href = 'store.html'; shop.textContent = 'Store'; shop.className = 'shop';
  const chat = document.createElement('a');
  chat.href = 'servers.html'; chat.textContent = 'Servers'; chat.className = 'shop';
  const char = document.createElement('a');
  char.href = 'character.html'; char.textContent = 'Character'; char.className = 'shop';
  box.append(char, shop, chat);
  const a = document.createElement('a');
  a.href = 'login.html';
  if (user) { const w = walletOf(user); a.textContent = shortWallet(w); a.title = 'Signed in as ' + w; } else a.textContent = 'Log in with wallet';
  box.append(a);
  if (user) ownedProducts().then(s => { owned = s; paintLo(); paintLand(); }, () => {});
  else { owned = new Set(); paintLo(); paintLand(); }
  if (!user) return;
  const out = document.createElement('button');
  out.type = 'button'; out.textContent = 'Log out';
  out.onclick = () => signOut().then(() => paintAccount(null), () => status('Could not log out. Try again.'));
  box.append(out);
}
if (maybeSignedIn()) currentUser().then(paintAccount, () => paintAccount(null)); else paintAccount(null);
function playerName() { const n = cleanName($('nameIn').value); saveName(n); return n; }

function enterGame() {
  inGame = true; $('menu').hidden = true; $('hud').hidden = false; status('');
  muted.clear(); $('chatLog').textContent = ''; if (document.activeElement) document.activeElement.blur();
  chatLine('', voiceOn && net?.sendBin ? 'Hold V to talk to your team. Enter for team chat.' : 'Press Enter for team chat.', 'sys');
  snaps = []; offEst = null; act = { lo: kit().lo, sa: kit().sa, eq: kit().eq }; cur = act.lo; wasAlive = true; deathAt = null; roster = new Map();
  battle.reset(); battle.start();
  dropSoldiers(); clearThrown(); paintLo(); hudCache.kitNote = null; setText('kitNote', '');
}
function leaveGame(msg = '') {
  voice.close(); closeChat(); held = null; battle.reset();
  if (net) { const n = net; net = null; n.close(); }
  inGame = false; $('hud').hidden = true; $('pauseOv').hidden = true; $('menu').hidden = false; status(msg); paintLand();
  if (document.pointerLockElement) document.exitPointerLock();
  dropSoldiers(); clearThrown(); paintLo();
  if (fightCode && !$('fightBox').hidden) checkFight();   // how many are still in the fight
}
$('practice').onclick = async () => {
  if (connecting) return;
  audio(); lock();
  const pick = land === 'any' ? randomMap(owned) : land;
  if (!await prepare(pick)) return;
  const room = new Room({ id: 'practice', minPlayers: 8, map: pick });
  let live = true;
  const id = room.addPlayer(playerName(), kit().lo, m => queueMicrotask(() => live && onMsg(m)), 'all', null, { sa: kit().sa, eq: kit().eq, gear: packGear(kit().gear) });   // practice: try everything
  const timer = setInterval(() => room.update(1 / 30), 1000 / 30);
  net = { send: m => room.onMessage(id, m), close() { live = false; clearInterval(timer); } };
  enterGame();
};
// Say what is locked instead of silently changing the player's choice.
function needsStore() {
  const what = land !== 'any' && !canPlay(land, owned) ? getMap(land).name : [kit().lo, kit().sa].map(id => WEAPONS[id]).find(w => locked(w.product))?.name;
  if (!what) return false;
  status('');
  const a = document.createElement('a');
  a.href = 'store.html'; a.textContent = 'Open the Store';
  $('status').append(what + ' is locked online. Practice is free. ', a);
  return true;
}
let connecting = false;
// Loads a land before a match. False when it did not work, or something else started meanwhile.
async function prepare(id) {
  if (id === MAP.id && warming?.ready) return true;
  connecting = true; status('Loading the land…');
  try { await makeReady(id); status(''); return !inGame; }
  catch { status('Could not load this land. Check your connection and try again.'); if (document.pointerLockElement) document.exitPointerLock(); return false; }
  finally { connecting = false; }
}
// A private fight link (?fight=code) from a chat server. The fight decides the land.
const fightCode = /^[a-z0-9]{10}$/.test(new URLSearchParams(location.search).get('fight') || '') ? new URLSearchParams(location.search).get('fight') : null;
let fight = null;
async function checkFight() {
  if (!fightCode) return;
  const box = $('fightBox');
  box.hidden = false;
  try {
    const r = await fetch('fight/' + fightCode, { cache: 'no-store' });
    if (r.status === 404) { fight = null; $('fightText').textContent = 'This fight link has expired. Ask for a new one in your server.'; $('fightGo').hidden = true; return; }
    if (!r.ok) throw new Error(r.status);
    fight = await r.json();
    const full = fight.players >= fight.n * 2;
    $('fightText').textContent = `Private ${fight.n} vs ${fight.n} fight on ${fight.land} · ${fight.players} of ${fight.n * 2} here${full ? ' (full)' : ''}`;
    $('fightGo').hidden = full;
    if (!inGame && isMap(fight.map)) { land = fight.map; paintLand(); }
  } catch { $('fightText').textContent = 'Could not reach the game server to check this fight. Try again in a moment.'; $('fightGo').hidden = false; }
}
if (fightCode) checkFight();
$('fightGo').onclick = () => goOnline(true);
$('fightNo').onclick = () => { history.replaceState(null, '', location.pathname); $('fightBox').hidden = true; fight = null; };
$('online').onclick = () => goOnline(false);
async function goOnline(private_) {
  if (connecting) return;
  if (private_ && !fight) { await checkFight(); if (!fight || inGame) return; }
  if (!private_ && needsStore()) return;
  audio(); lock(); voice.ready();
  if (!/^https?:$/.test(location.protocol)) { status('Open this page from the game server to play online.'); return; }
  const want = private_ ? fight.map : land;
  if (!await prepare(want)) return;
  status('Connecting…');
  connecting = true;
  const token = await accessToken().catch(() => null);
  connecting = false;
  if (inGame) return;
  let ws, opened = false, mine = null;
  try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); }
  catch { status('No game server found at this address. Try Practice, or deploy the server.'); return; }
  const to = setTimeout(() => { if (!opened) { ws.close(); status('No game server found at this address. Try Practice, or deploy the server.'); if (document.pointerLockElement) document.exitPointerLock(); } }, 4000);
  ws.onopen = () => {
    opened = true; clearTimeout(to);
    ws.send(JSON.stringify({ t: 'join', name: playerName(), lo: kit().lo, sa: kit().sa, eq: kit().eq, gear: packGear(kit().gear), map: want, fight: private_ ? fightCode : undefined, token: token || undefined }));
    net = mine = { online: true, send: m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }, sendBin: b => { if (ws.readyState === 1 && ws.bufferedAmount < 32768) ws.send(b); }, close: () => ws.close() };
    enterGame();
  };
  ws.binaryType = 'arraybuffer';
  ws.onmessage = e => { if (net !== mine) return; if (typeof e.data !== 'string') { voice.receive(e.data); return; } let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => { if (inGame && mine && net === mine) leaveGame('Disconnected from the server.'); };
  ws.onerror = () => {};
}
$('resume').onclick = () => { $('resume').blur(); lock(); };
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
  const t = nowS(), real = Math.min(1, t - last), dt = Math.min(0.05, real); last = t;
  updateFx(dt);
  if (inGame) {
    updateThrown(real);   // grenades keep server time even on a slow screen
    updateKits(t);
    updateLocal(dt, t);
    interpRemotes(dt);
    updateHud(dt, t);
    updateTalk();
    drawMini();
  } else {
    menuA += dt * 0.05;
    if (MAP.theme.ring || MAP.city) { cam.position.set(Math.sin(menuA) * 12, 14, Math.cos(menuA) * 12); cam.lookAt(-Math.sin(menuA) * 40, 6, -Math.cos(menuA) * 40); }   // cities are walled in by buildings
    else { cam.position.set(Math.sin(menuA) * 46, 18, Math.cos(menuA) * 46); cam.lookAt(0, 0, 0); }
    cam.fov = 60; cam.updateProjectionMatrix();
  }
  battle.update({ play: inGame && phase === 'play' && !held && snaps.length > 1, paused: !$('pauseOv').hidden, talk: voice.talking || voice.speakers().some(allowedSpeaker), cam, myId, myTeam, others });
  if (warming && !warming.drawable) return;   // the last picture stays until the new land can be drawn without stopping
  updateAir(dt);
  war.update(dt, { cam, yaw: inGame ? me.yaw : cam.rotation.y, team: myTeam, world });
  if (MAP.city) fitShadow(true);
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
    const onWall = me.wl ? leanMove(ix, iz, dt) : null;
    if (onWall) [ix, iz] = onWall;
    if (!me.wl && stance === 1 && K.ShiftLeft && f > 0 && slideT <= 0 && !holdKneel && t - stanceT > 0.4) setStance(0);   // sprinting stands up
    me.cr = fitStance(me, stance, BOXES);
    if (slideT > 0) {
      slideT -= dt;
      if (Math.hypot(me.vx, me.vz) < 2.5 || !me.ground) slideT = 0;
      ix = slideDir[0]; iz = slideDir[1];
    }
    const sprint = K.ShiftLeft && f > 0 && !me.wl && !me.cr && !ads && !trigger && !aiming;
    const speed = me.wl ? PHYS.lean : slideT > 0 ? PHYS.crouch + (PHYS.slide - PHYS.crouch) * Math.min(1, slideT / 0.45) : me.cr === 2 ? PHYS.prone : me.cr ? PHYS.crouch : ads ? PHYS.ads * (W.slot === 2 ? 1.3 : 1) : sprint ? PHYS.sprint : PHYS.walk;
    if (K.Space && me.ground && !me.cr && !stance && !me.wl) { me.vy = PHYS.jump; me.ground = false; }
    const y0 = me.y, stood = me.ground;
    step(me, ix, iz, speed, dt, BOXES);
    if (stood && me.ground && me.y - y0 > 0.1) stepOff = Math.max(-0.6, stepOff - (me.y - y0));
    stepOff *= Math.exp(-dt * 13);
    const lo = leanOff(me);
    eyeH += (stanceEye(me.cr) + lo.y - eyeH) * Math.min(1, dt * 12);
    leanX += (lo.x - leanX) * Math.min(1, dt * 20); leanZ += (lo.z - leanZ) * Math.min(1, dt * 20);
    leanK += ((me.wl && !ads && !trigger && Math.abs(me.pk) < 0.3 && !aiming ? 1 : 0) - leanK) * Math.min(1, dt * 9);
    const hs = Math.hypot(me.vx, me.vz);
    if (me.ground && hs > 1) { bobT += dt * hs * 1.7; stepAcc += hs * dt; if (stepAcc > (sprint ? 2.4 : 1.9) && !me.cr) { stepAcc = 0; if (!me.wl) noiseSfx(0.07, 700, 0.05); } }
    adsT += ((ads && reloadT <= 0 && !sprint ? 1 : 0) - adsT) * Math.min(1, dt * (cur === 'sniper' ? 7 : 11));
    bloom = Math.max(0, bloom - dt * 0.12);
    const rec = Math.min(recoilDebt, dt * 0.35); me.pitch -= rec; recoilDebt -= rec;
    if (trigger) tryFire();
    if (reloadT > 0) reloadT -= dt;
    inputAcc += dt;
    if (inputAcc >= 0.05) {
      inputAcc = 0;
      send({ t: 'in', sp, x: +me.x.toFixed(3), y: +me.y.toFixed(3), z: +me.z.toFixed(3), yaw: +me.yaw.toFixed(4), pitch: +me.pitch.toFixed(4), cr: me.cr, wl: me.wl || undefined, pk: me.wl ? +me.pk.toFixed(2) : undefined });
    }
    cam.position.set(me.x + leanX, me.y + eyeH + stepOff + Math.sin(bobT * 2) * 0.025 * (1 - adsT), me.z + leanZ);
    cam.rotation.set(me.pitch + rnd(-shake, shake), me.yaw + rnd(-shake, shake), Math.sin(bobT) * 0.004 + Math.min(1, Math.max(0, slideT) * 4) * 0.06 - (leanX * Math.cos(me.yaw) - leanZ * Math.sin(me.yaw)) * 0.2);
  } else if (deathAt) {
    adsT = 0; trigger = false;
    const k = others.get(killer);
    cam.position.lerp(V.set(deathAt.x, deathAt.y + 2.2, deathAt.z), Math.min(1, dt * 2));
    if (k) cam.lookAt(k.s.x, k.s.y + 1.2, k.s.z);
  }
  const fov = 78 + (W.fov - 78) * adsT;
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  // viewmodel
  const vm = vmGun(cur);
  for (const k in VMS) VMS[k].g.visible = k === cur;
  if (vm) {
    const sw = Math.max(0, 0.35 - (t - switchT)) / 0.35 + (aiming ? 0.5 : 0);
    const rl = reloadT > 0 ? Math.sin(Math.PI * (1 - reloadT / reloadDur)) : 0;
    sway.x *= 1 - Math.min(1, dt * 8); sway.y *= 1 - Math.min(1, dt * 8);
    kick.z *= 1 - Math.min(1, dt * 16); kick.r *= 1 - Math.min(1, dt * 14);
    const bob = 1 - adsT;
    vm.g.position.lerpVectors(vm.hip, vm.ads, adsT);
    vm.g.position.x += (Math.sin(bobT) * 0.012 - sway.x) * bob;
    vm.g.position.y += (-Math.abs(Math.cos(bobT)) * 0.01 + sway.y) * bob - sw * 0.3 - rl * 0.12 - leanK * 0.03;
    vm.g.position.z += kick.z;
    vm.g.rotation.set(kick.r + rl * 0.7 + leanK * 0.5, -sway.x * 2 * bob + rl * 0.3, -rl * 0.25 + leanK * 0.15);   // held close to the chest on a wall
    muzzle.position.copy(vm.muzzle).applyEuler(vm.g.rotation).add(vm.g.position);
    muzzle.scale.setScalar(W.slot === 2 ? 0.12 : 0.2);
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
  const E = EQUIP[act.eq];
  const live = act.eq === 'charge' && myCharge();
  setText('eqN', live ? 'Charge set: G to blow it' : E.name + ' × ' + srv.eq + '  [G]'); $('eqN').classList.toggle('out', !srv.eq && !live);
  setText('stance', me.wl ? (Math.abs(me.pk) > 0.3 ? 'Leaning out' : 'Against a wall') : ['', 'Kneeling', 'Lying down'][me.cr]);
  if (t > nearAt) { nearAt = t + 0.15; nearWall = leanUses < 5 && srv.al && !me.wl && me.ground && stance !== 2 && Math.hypot(me.vx, me.vz) < 5.5 ? findWall(me, BOXES) : 0; }
  setText('aimHint', aiming ? 'Release G to throw. Right click to cancel.' : me.wl && srv.al && t - leanT < 6 ? (leanKnelt ? 'Right click or push into the wall: look over. ' : '') + 'A / D at a corner, or right click: lean out. F: step away.' : nearWall ? 'F: lean on the wall' : '');
  updateArc();
  const blindT = blindEnd - t;
  $('blind').style.opacity = srv.al && blindT > 0 ? Math.min(1, blindT / Math.max(0.6, blindMax * 0.6)) : 0;
  let danger = false;
  for (const f of fires) if (Math.hypot(f.g.position.x - me.x, f.g.position.z - me.z) < EQUIP.fire.radius + 0.5) danger = true;
  for (const q of nades.values()) if ((q.w === 'frag' || (q.w === 'charge' && q.by !== myId)) && (q.tm !== myTeam || q.by === myId) && Math.hypot(q.n.x - me.x, q.n.z - me.z) < EQUIP.frag.radius) danger = true;
  for (const [x, z, left] of war.bombs()) if (left < 2.6 && Math.hypot(x - me.x, z - me.z) < BOMB_REACH + 1) danger = true;
  if (airT > 0 && (airT -= dt) <= 0) airText('');
  if (danger && srv.al && $('nadeWarn').hidden) battle.danger();
  $('nadeWarn').hidden = !danger || !srv.al;
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
    setText('center', `${killer === myId ? 'Caught by your own bomb' : !killer ? 'Killed from the air' : 'Eliminated by ' + pname(killer)}\nRedeploying in ${srv.rs.toFixed(1)}`);
  } else if (srv.al && srv.pr && phase === 'play') setText('center', 'Spawn protection');
  else if (phase === 'play') setText('center', '');
}
requestAnimationFrame(frame);
