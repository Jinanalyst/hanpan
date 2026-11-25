// Textures of the generated cities, drawn in code: facades by use, shop windows and signs.
import * as THREE from 'three';

export function random(seed) { let s = seed || 1; return (a = 0, b = 1) => a + (s = s * 16807 % 2147483647) / 2147483647 * (b - a); }
let tick = random(77);
export function speck(g, n, count, cols, max) {
  for (let i = 0; i < count; i++) { g.globalAlpha = tick(0.2, 0.7); g.fillStyle = cols[tick(0, cols.length) | 0]; const s = tick(1, max); g.fillRect(tick(0, n), tick(0, n), s, s); }
  g.globalAlpha = 1;
}
function canvas(w, h, draw, r = random(31)) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d', { willReadFrequently: true }), w, r);
  return c;
}
export function canvasTexture(n, draw) {
  const t = new THREE.CanvasTexture(canvas(n, n, draw));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// Pictures stacked into one texture, so different looks share one draw call. Row 0 becomes the bottom.
function stack(w, h, pictures, repeat) {
  const data = new Uint8Array(w * h * 4 * pictures.length);
  pictures.forEach((draw, i) => {
    const px = canvas(w, h, draw, random(101 + i * 37)).getContext('2d').getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) data.set(px.subarray(y * w * 4, (y + 1) * w * 4), (i * h + h - 1 - y) * w * 4);
  });
  const t = new THREE.DataArrayTexture(data, w, h, pictures.length);
  t.format = THREE.RGBAFormat; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 2;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

/* ---- facades: a picture is 4 bays wide and 4 floors high ---- */
export const BAY = [3, 3.4, 3.6, 2.9];              // metres: office, commercial, residential, low brick
const N = 512, C = N / 4;
const grime = (g, r, n) => { for (let i = 0; i < n; i++) { g.globalAlpha = r(0.02, 0.08); g.fillStyle = r() < 0.5 ? '#000' : '#fff'; g.fillRect(r(0, N), r(0, N), r(1, 6), r(1, 10)); } g.globalAlpha = 1; };
function glass(g, r, x, y, w, h, top, low, blinds = 0.4) {
  const gr = g.createLinearGradient(x, y, x, y + h), k = r(-9, 9);
  const tone = c => `rgb(${c.map(v => Math.max(0, Math.min(255, v + k)) | 0)})`;
  gr.addColorStop(0, tone(top)); gr.addColorStop(1, tone(low));
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  if (r() < blinds) { const b = r(0.12, 0.6); g.fillStyle = 'rgba(214,208,194,.5)'; g.fillRect(x, y, w, h * b); }   // blind
}
const each = draw => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) draw(x * C, y * C); };
const OFFICE = (g, n, r) => {
  g.fillStyle = '#c9cdcf'; g.fillRect(0, 0, n, n);
  each((x, y) => {
    glass(g, r, x + 5, y + 4, C - 10, C * 0.68, [188, 206, 216], [132, 154, 168], 0.22);
    g.fillStyle = '#9aa6ad'; g.fillRect(x + 5, y + C * 0.72, C - 10, C * 0.22);
    g.fillStyle = '#e2e5e6'; g.fillRect(x, y, 6, C); g.fillRect(x, y + C - 6, C, 6);
  });
};
const COMMERCIAL = (g, n, r) => {
  g.fillStyle = '#c3bcb1'; g.fillRect(0, 0, n, n); grime(g, r, 700);
  g.strokeStyle = 'rgba(70,64,56,.22)'; g.lineWidth = 2;
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(n, i * 64); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, n); g.stroke(); }
  each((x, y) => {
    g.fillStyle = '#4b4d4e'; g.fillRect(x + 8, y + 26, C - 16, C * 0.6);
    glass(g, r, x + 12, y + 30, C - 24, C * 0.6 - 8, [142, 166, 178], [84, 104, 116]);
    g.fillStyle = '#4b4d4e'; g.fillRect(x + C / 2 - 2, y + 28, 4, C * 0.6 - 4);
    if (r() < 0.42) { g.fillStyle = ['#b23a34', '#2c5f93', '#2f7a54', '#d09a2c', '#6a4a8c', '#e9e5dc'][r(0, 6) | 0]; g.globalAlpha = 0.85; g.fillRect(x + 12, y + 66, C - 24, 18); g.globalAlpha = 1; g.fillStyle = 'rgba(255,255,255,.85)'; for (let k = 0; k < 5; k++) g.fillRect(x + 24 + k * 16, y + 71, 10, 8); }   // film on the window
  });
};
const FLATS = (g, n, r) => {
  g.fillStyle = '#d8d0c2'; g.fillRect(0, 0, n, n); grime(g, r, 600);
  each((x, y) => {
    g.fillStyle = '#f0ece3'; g.fillRect(x + 10, y + 22, C - 20, C * 0.64);
    glass(g, r, x + 14, y + 26, C - 28, C * 0.64 - 8, [134, 150, 158], [86, 100, 108]);
    g.fillStyle = '#f0ece3'; for (const k of [0.33, 0.66]) g.fillRect(x + 14 + (C - 28) * k, y + 26, 3, C * 0.64 - 8);
    g.fillStyle = 'rgba(90,96,100,.8)'; g.fillRect(x + 8, y + 74, C - 16, 3); for (let k = 0; k < 14; k++) g.fillRect(x + 10 + k * 8, y + 74, 1.5, 30);   // railing
    g.fillStyle = '#bdb4a4'; g.fillRect(x, y + C - 12, C, 10); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + C - 2, C, 2);
    if (r() < 0.4) { g.fillStyle = '#e4e4e2'; g.fillRect(x + 84, y + 80, 28, 20); g.fillStyle = '#777'; g.beginPath(); g.arc(x + 95, y + 90, 7, 0, 7); g.fill(); }
  });
};
const bricks = (g, r, n, cols) => { for (let y = 0; y < n / 8; y++) for (let x = -1; x < n / 24 + 1; x++) { g.fillStyle = cols[r(0, cols.length) | 0]; g.fillRect(x * 24 + (y % 2) * 12 + 1, y * 8 + 1, 22.5, 6.5); } };
const BRICK = (g, n, r) => {
  g.fillStyle = '#a89a8a'; g.fillRect(0, 0, n, n); bricks(g, r, n, ['#a2664c', '#93593f', '#ac7257', '#9b6048']);
  each((x, y) => {
    g.fillStyle = '#e8e2d6'; g.fillRect(x + 24, y + 26, C - 48, C * 0.52);
    glass(g, r, x + 28, y + 30, C - 56, C * 0.52 - 8, [130, 144, 150], [80, 92, 98]);
    g.fillStyle = '#e8e2d6'; g.fillRect(x + C / 2 - 2, y + 30, 4, C * 0.52 - 8);
    g.fillStyle = '#cfc5b4'; g.fillRect(x + 20, y + 26 + C * 0.52, C - 40, 7);
    g.fillStyle = 'rgba(206,196,178,.8)'; g.fillRect(x, y + C - 6, C, 6);
    if (r() < 0.3) { g.fillStyle = '#d9dad8'; g.fillRect(x + 30, y + 104, 30, 18); }
  });
};
// Ground floors, one floor high: doors and plain walls. Shops are separate and stand in front.
const GROUND = [
  (g, n, r) => { g.fillStyle = '#7d8387'; g.fillRect(0, 0, n, n); for (let x = 0; x < 4; x++) { const X = x * C; glass(g, r, X + 6, 60, C - 12, n - 80, [150, 172, 184], [98, 116, 128]); g.fillStyle = '#9aa1a5'; g.fillRect(X, 0, 6, n); g.fillRect(X, 250, C, 6); if (x === 1) { g.fillStyle = '#c8cdd0'; g.fillRect(X + C / 2 - 3, 256, 6, n - 256); } } g.fillStyle = '#77797a'; g.fillRect(0, 0, n, 54); },
  (g, n, r) => { g.fillStyle = '#a49d92'; g.fillRect(0, 0, n, n); grime(g, r, 800); for (let x = 0; x < 4; x++) { const X = x * C; if (x === 2) { g.fillStyle = '#585c5f'; g.fillRect(X + 10, 120, C - 20, n - 120); g.fillStyle = '#6b7074'; for (let k = 0; k < 24; k++) g.fillRect(X + 10, 124 + k * 16, C - 20, 8); } else { g.fillStyle = '#46494b'; g.fillRect(X + 10, 130, C - 20, n - 160); glass(g, r, X + 16, 136, C - 32, n - 172, [140, 156, 164], [92, 106, 114]); } } g.fillStyle = '#8a8378'; g.fillRect(0, 0, n, 60); g.fillRect(0, n - 24, n, 24); },
  (g, n, r) => { g.fillStyle = '#b3aa9a'; g.fillRect(0, 0, n, n); grime(g, r, 800); for (let x = 0; x < 4; x++) { const X = x * C; if (x === 0) { g.fillStyle = '#6a5b4a'; g.fillRect(X + 20, 150, C - 40, n - 150); glass(g, r, X + 34, 170, C - 68, 200, [120, 136, 142], [66, 78, 84]); } else { g.fillStyle = '#efeae0'; g.fillRect(X + 18, 150, C - 36, 190); glass(g, r, X + 24, 156, C - 48, 178, [108, 124, 132], [60, 72, 80]); } } g.fillStyle = '#968d7d'; g.fillRect(0, n - 60, n, 60); g.fillStyle = '#cfc6b5'; g.fillRect(0, 0, n, 34); },
  (g, n, r) => { g.fillStyle = '#9a8c7c'; g.fillRect(0, 0, n, n); bricks(g, r, n, ['#8d8478', '#989084', '#857c70']); for (let x = 0; x < 4; x++) { const X = x * C; if (x === 1) { g.fillStyle = '#35383a'; g.fillRect(X - 30, 120, C + 60, n - 120); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(X - 30, 120, C + 60, 60); } else if (x === 3) { g.fillStyle = '#5b6b62'; g.fillRect(X + 26, 150, C - 52, n - 150); g.fillStyle = '#8fa096'; g.fillRect(X + 40, 180, C - 80, 130); } } g.fillStyle = '#c9c0b1'; g.fillRect(0, 0, n, 26); },
];
let facades = null;
export const facadeTexture = () => facades || (facades = stack(N, N, [OFFICE, COMMERCIAL, FLATS, BRICK, ...GROUND], true));

/* ---- shop windows, one picture per kind of shop ---- */
const LOOK = {   // board, board text, inside top, inside bottom, frame
  cafe: ['#3a2a20', '#f3e3c8', '#f0cf9a', '#7a5233', '#2b211b'], food: ['#a12f26', '#fff3d8', '#f3c987', '#7c4128', '#33241c'], fast: ['#e0a21c', '#3a1d10', '#fbe0a4', '#b3552c', '#4a2c1c'],
  bar: ['#20202c', '#ff9ac6', '#8a4a7c', '#2a1c36', '#15141c'], bakery: ['#e9dcc3', '#6a4122', '#fbe3b4', '#a06c3a', '#5d4530'], beauty: ['#f0d8df', '#7a2c50', '#fbeef0', '#b48796', '#d8c2c9'],
  mart: ['#1f7a4d', '#ffffff', '#f4fbff', '#8fa7a5', '#e8ecec'], bank: ['#1f3f73', '#ffffff', '#dfe9f2', '#6f8398', '#8c979f'], clinic: ['#f4f8f8', '#14788a', '#eef8f8', '#9dbcbf', '#c8d4d5'],
  fashion: ['#17181a', '#f4f1ea', '#f5eadb', '#8d7b6a', '#1c1c1e'], stage: ['#5a1830', '#ffd77a', '#c47a4a', '#3a1420', '#24101a'], goods: ['#2d4f5f', '#f2eee2', '#eadfc8', '#7a7160', '#33393d'],
};
const W = 512, H = 256;
const INSIDE = {
  cafe(g, r) { for (let i = 0; i < 5; i++) { const x = 34 + i * 66; g.fillStyle = '#3c2a1e'; g.fillRect(x, 190, 40, 6); g.fillRect(x + 17, 196, 6, 40); g.fillStyle = '#5c4230'; g.fillRect(x - 10, 204, 12, 32); g.fillRect(x + 40, 204, 12, 32); } g.fillStyle = '#fff0c4'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(40 + i * 58, 84, 9, 0, 7); g.fill(); } },
  food(g, r) { INSIDE.cafe(g, r); g.fillStyle = '#c4382c'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(50 + i * 68, 90, 13, 17, 0, 0, 7); g.fill(); } },
  fast(g) { g.fillStyle = '#7c2f1c'; g.fillRect(20, 176, 330, 60); g.fillStyle = '#fff6df'; for (let i = 0; i < 4; i++) g.fillRect(28 + i * 82, 72, 72, 46); g.fillStyle = '#d4682e'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(64 + i * 82, 96, 15, 0, 7); g.fill(); } },
  bar(g, r) { for (let y = 0; y < 3; y++) { g.fillStyle = '#1d1526'; g.fillRect(24, 106 + y * 38, 320, 5); for (let i = 0; i < 22; i++) { g.fillStyle = ['#3fae7c', '#c98a35', '#b04a6a', '#5a86c8'][r(0, 4) | 0]; g.fillRect(28 + i * 14.4, 84 + y * 38, 8, 22); } } g.fillStyle = '#ff6fb0'; g.fillRect(30, 70, 310, 4); },
  bakery(g, r) { for (let y = 0; y < 3; y++) { g.fillStyle = '#6b4a2c'; g.fillRect(22, 112 + y * 44, 326, 6); for (let i = 0; i < 12; i++) { g.fillStyle = ['#c98a44', '#b57434', '#dba75e'][r(0, 3) | 0]; g.beginPath(); g.ellipse(38 + i * 27, 105 + y * 44, 11, 8, 0, 0, 7); g.fill(); } } },
  beauty(g) { for (let i = 0; i < 4; i++) { const x = 34 + i * 82; g.fillStyle = '#ffffff'; g.fillRect(x, 82, 46, 74); g.fillStyle = '#b9ccd2'; g.fillRect(x + 4, 86, 38, 66); g.fillStyle = '#4a3a42'; g.fillRect(x + 6, 180, 34, 40); g.fillRect(x + 18, 220, 10, 16); } },
  mart(g, r) { for (let y = 0; y < 4; y++) { g.fillStyle = '#dfe6e6'; g.fillRect(20, 108 + y * 34, 330, 4); for (let i = 0; i < 26; i++) { g.fillStyle = `hsl(${r(0, 360) | 0},55%,55%)`; g.fillRect(24 + i * 12.4, 88 + y * 34, 10, 20); } } },
  bank(g) { g.fillStyle = '#54687c'; g.fillRect(20, 190, 330, 46); g.fillStyle = '#f2f6fa'; for (let i = 0; i < 4; i++) g.fillRect(34 + i * 80, 160, 46, 34); g.fillStyle = '#2f5f9c'; g.fillRect(20, 80, 330, 14); },
  clinic(g) { g.fillStyle = '#2aa0a8'; g.fillRect(162, 84, 18, 66); g.fillRect(138, 108, 66, 18); g.fillStyle = '#d3e4e6'; g.fillRect(20, 184, 330, 52); },
  fashion(g, r) { for (let i = 0; i < 6; i++) { const x = 44 + i * 52; g.fillStyle = `hsl(${r(0, 360) | 0},28%,${r(34, 60) | 0}%)`; g.beginPath(); g.moveTo(x - 14, 112); g.lineTo(x + 14, 112); g.lineTo(x + 20, 190); g.lineTo(x - 20, 190); g.fill(); g.fillStyle = '#d8c3ae'; g.beginPath(); g.arc(x, 98, 9, 0, 7); g.fill(); g.fillStyle = '#39332d'; g.fillRect(x - 2, 190, 4, 44); } },
  stage(g) { g.fillStyle = '#8c2038'; for (let i = 0; i < 12; i++) g.fillRect(20 + i * 28, 70, 18, 166); g.fillStyle = '#ffe08a'; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(28 + i * 21, 72, 4, 0, 7); g.fill(); } },
  goods(g, r) { for (let y = 0; y < 3; y++) { g.fillStyle = '#5a4f40'; g.fillRect(20, 118 + y * 46, 330, 5); for (let i = 0; i < 11; i++) { const h = r(14, 34); g.fillStyle = `hsl(${r(0, 360) | 0},38%,52%)`; g.fillRect(26 + i * 30, 118 + y * 46 - h, 20, h); } } },
};
function front(id) {
  const L = LOOK[id] || LOOK.goods;
  return (g, n, r) => {
    g.fillStyle = L[4]; g.fillRect(0, 0, W, H);
    const pane = (x, w, y = 52, h = 190) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, L[2]); gr.addColorStop(1, L[3]); g.fillStyle = gr; g.fillRect(x, y, w, h); };
    pane(14, 340); pane(378, 120);
    g.save(); g.beginPath(); g.rect(14, 52, 340, 190); g.clip(); (INSIDE[id] || INSIDE.goods)(g, r); g.restore();
    g.fillStyle = 'rgba(255,255,255,.13)'; for (const x of [40, 190, 400]) { g.beginPath(); g.moveTo(x, 242); g.lineTo(x + 70, 52); g.lineTo(x + 104, 52); g.lineTo(x + 34, 242); g.fill(); }   // light on the glass
    g.fillStyle = L[4]; g.fillRect(180, 52, 7, 190); g.fillRect(434, 52, 5, 190);
    g.fillStyle = '#d9d3c4'; g.fillRect(428, 140, 4, 30); g.fillRect(442, 140, 4, 30);
    g.fillStyle = L[0]; g.fillRect(0, 0, W, 34); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 34, W, 8); g.fillRect(0, H - 14, W, 14);
  };
}
export const shopWindows = kinds => stack(W, H, kinds.map(front), false);

/* ---- signs: all names on one sheet ---- */
export const SIGN = { cols: 8, w: 256, h: 64 };
export function signSheet(names, kinds) {
  const rows = Math.ceil(names.length / SIGN.cols), h = 2 ** Math.ceil(Math.log2(Math.max(1, rows) * SIGN.h));
  const c = canvas(SIGN.cols * SIGN.w, h, g => {
    names.forEach(([cat, text], i) => {
      const x = i % SIGN.cols * SIGN.w, y = (i / SIGN.cols | 0) * SIGN.h, L = LOOK[kinds[cat]] || LOOK.goods;
      g.fillStyle = L[0]; g.fillRect(x, y, SIGN.w, SIGN.h);
      g.fillStyle = L[1]; g.textAlign = 'center'; g.textBaseline = 'middle';
      const styles = ['800 36px "Arial Black", Arial, sans-serif', '700 38px Georgia, serif', '700 38px "Trebuchet MS", sans-serif'];
      g.font = styles[(cat + i) % styles.length];
      g.fillText(text, x + SIGN.w / 2, y + SIGN.h / 2 + 2, SIGN.w - 28);
      g.globalAlpha = 0.5; g.fillRect(x + 8, y + SIGN.h - 8, SIGN.w - 16, 2); g.globalAlpha = 1;
    });
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { texture: t, rows: h / SIGN.h };
}
export const shopColor = id => (LOOK[id] || LOOK.goods)[0];
