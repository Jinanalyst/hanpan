// Small helpers shared by the war fronts.
import * as THREE from 'three';

export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
export const nowS = () => performance.now() / 1000;
// Soft, repeatable bumps in about -1..1.
export const bumps = (x, z) => Math.sin(x * 0.31 + z * 0.17) * 0.5 + Math.sin(x * 0.11 - z * 0.23 + 2) * 0.35 + Math.sin(x * 0.73 + z * 0.61) * 0.15;

export function ctex(size, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export const dots = (g, S, n, cols, max) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.random() * cols.length | 0]; g.globalAlpha = rnd(0.15, 0.6); const s = rnd(1, max); g.fillRect(Math.random() * S, Math.random() * S, s, s); } g.globalAlpha = 1; };

export function uvBox(w, h, d, s) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < 24; i++) { const [a, b] = dims[i / 4 | 0]; uv.setXY(i, uv.getX(i) * a / s, uv.getY(i) * b / s); }
  return g;
}

// Ground of a land and everything around it. height(x, z) in metres; paint(c, x, z, n, n2) sets the colour c, n and n2 are soft bumps.
export function groundMesh(map, height, paint) {
  const [hx, hz] = map.size, axis = (half, far) => {
    const a = [];
    for (let v = -half; v <= half + 1e-6; v += 1.75) a.push(v);
    const out = [0.25, 0.6, 1.4, 3, 6, 10, 16, 24, 36, 55, 80, 120, 180, far];
    return [...out.map(v => -half - v).reverse(), ...a, ...out.map(v => half + v)];
  };
  const xs = axis(hx, 300), zs = axis(hz, 300), pos = [], col = [], uv = [], ix = [], c = new THREE.Color();
  for (const z of zs) for (const x of xs) {
    pos.push(x, height(x, z), z); uv.push(x / 4, z / 4);
    paint(c, x, z, bumps(x * 1.3, z * 1.3), bumps(x * 0.5 + 9, z * 0.5));
    col.push(c.r, c.g, c.b);
  }
  const W = xs.length;
  for (let j = 0; j + 1 < zs.length; j++) for (let i = 0; i + 1 < W; i++) { const k = j * W + i; ix.push(k, k + W, k + 1, k + 1, k + W, k + W + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(ix); geo.computeVertexNormals();
  const grain = ctex(256, (g, S) => { g.fillStyle = '#e9e6e0'; g.fillRect(0, 0, S, S); dots(g, S, 5200, ['#c9c3b8', '#ffffff', '#b5ae9f', '#d9d4ca'], 3); dots(g, S, 260, ['#8f887a', '#a39c8e'], 6); });
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.97 }));
  m.receiveShadow = true;
  return m;
}
