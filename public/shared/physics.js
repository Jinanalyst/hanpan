// Shared movement + ray casting. Runs identically on server (bots) and client (local player).
// Yaw convention: yaw 0 looks toward -z. forward = (-sin yaw, 0, -cos yaw), right = (cos yaw, 0, -sin yaw).

export const PHYS = {
  r: 0.35,        // body radius
  h: 1.75,        // standing height
  hc: 1.2,        // crouch height
  eye: 1.6,
  eyec: 1.08,
  g: 20,
  jump: 6.4,
  walk: 5,
  sprint: 7,
  crouch: 2.4,
  hp: 0.6,        // lying height
  eyep: 0.42,
  prone: 1.3,
  slide: 8.5,
  ads: 3,
  step: 0.5,      // auto step-up height
};

// Stance: 0 standing, 1 kneeling, 2 lying down.
export const stanceH = cr => (cr === 2 ? PHYS.hp : cr ? PHYS.hc : PHYS.h);
export const stanceEye = cr => (cr === 2 ? PHYS.eyep : cr ? PHYS.eyec : PHYS.eye);
// The tallest stance that fits here, starting from the wanted one.
export function fitStance(p, want, boxes) {
  for (let c = want; c < 2; c++) if (c >= (p.cr | 0) || !hits(p.x, p.y + 0.002, p.z, stanceH(c), boxes)) return c;
  return 2;
}

// Big lands sort their boxes into square cells, so only the near ones are tested. Without a grid every box is.
const GRID = 4;
export function boxGrid(boxes) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.min[0]); z0 = Math.min(z0, b.min[2]); x1 = Math.max(x1, b.max[0]); z1 = Math.max(z1, b.max[2]); }
  x0 = Math.floor(x0 / GRID) - 1; z0 = Math.floor(z0 / GRID) - 1;
  const nx = Math.ceil(x1 / GRID) + 1 - x0, nz = Math.ceil(z1 / GRID) + 1 - z0, cells = Array.from({ length: nx * nz }, () => []);
  for (const b of boxes) {
    for (let i = Math.floor(b.min[0] / GRID) - x0; i <= Math.floor(b.max[0] / GRID) - x0; i++) for (let j = Math.floor(b.min[2] / GRID) - z0; j <= Math.floor(b.max[2] / GRID) - z0; j++) cells[i * nz + j].push(b);
  }
  Object.defineProperty(boxes, 'grid', { value: { x0, z0, nx, nz, cells }, configurable: true });
  return boxes;
}
// The first box near (x, z), within r, for which test is true.
export function findBox(boxes, x, z, r, test) {
  const g = boxes.grid;
  if (!g) { for (const b of boxes) if (test(b)) return b; return null; }
  const i1 = Math.min(g.nx - 1, Math.floor((x + r) / GRID) - g.x0), j1 = Math.min(g.nz - 1, Math.floor((z + r) / GRID) - g.z0);
  for (let i = Math.max(0, Math.floor((x - r) / GRID) - g.x0); i <= i1; i++) for (let j = Math.max(0, Math.floor((z - r) / GRID) - g.z0); j <= j1; j++) for (const b of g.cells[i * g.nz + j]) if (test(b)) return b;
  return null;
}

function overlaps(x, y, z, h, b) {
  return x + PHYS.r > b.min[0] && x - PHYS.r < b.max[0] &&
         z + PHYS.r > b.min[2] && z - PHYS.r < b.max[2] &&
         y + h > b.min[1] && y < b.max[1];
}

export function hits(x, y, z, h, boxes) {
  return findBox(boxes, x, z, PHYS.r, b => overlaps(x, y, z, h, b));
}

function moveAxis(p, axis, d, h, boxes) {
  if (!d) return;
  const k = axis ? 'z' : 'x';
  const old = p[k];
  p[k] += d;
  const b = hits(p.x, p.y, p.z, h, boxes);
  if (!b) return;
  if (p.ground && b.max[1] - p.y <= PHYS.step && !hits(p.x, b.max[1] + 0.01, p.z, h, boxes)) {
    p.y = b.max[1] + 0.001;
    return;
  }
  p[k] = old;
  if (axis) p.vz = 0; else p.vx = 0;
}

// p: {x,y,z,vx,vy,vz,ground,cr}; (ix,iz) is the wished direction in world space (length <= 1)
export function step(p, ix, iz, speed, dt, boxes) {
  const h = stanceH(p.cr);
  const k = p.ground ? Math.min(1, dt * 12) : Math.min(1, dt * 2.5);
  p.vx += (ix * speed - p.vx) * k;
  p.vz += (iz * speed - p.vz) * k;
  moveAxis(p, 0, p.vx * dt, h, boxes);
  moveAxis(p, 1, p.vz * dt, h, boxes);
  p.vy -= PHYS.g * dt;
  let ny = p.y + p.vy * dt;
  p.ground = false;
  if (ny <= 0) { ny = 0; p.vy = 0; p.ground = true; }
  const b = hits(p.x, ny, p.z, h, boxes);
  if (b) {
    if (p.vy <= 0) { ny = b.max[1]; p.ground = true; } else ny = b.min[1] - h;
    p.vy = 0;
  }
  p.y = ny;
}

// Slab test. Returns distance along ray or Infinity. If n is given, writes the hit normal into it.
export function rayBox(o, d, mn, mx, n) {
  let t0 = 0, t1 = 1e9, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return Infinity;
      continue;
    }
    let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i], s = -1;
    if (a > b) { [a, b] = [b, a]; s = 1; }
    if (a > t0) { t0 = a; axis = i; sign = s; }
    if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  if (n) { n[0] = n[1] = n[2] = 0; if (axis >= 0) n[axis] = sign; }
  return t0;
}

// Nearest hit against map boxes and the ground plane. Optionally returns the surface normal in n.
export function rayMap(o, d, boxes, maxT = 500, n) {
  let t = maxT;
  const tmp = n ? [0, 0, 0] : null;
  const test = list => {
    for (const b of list) {
      const h = rayBox(o, d, b.min, b.max, tmp);
      if (h < t) { t = h; if (n) { n[0] = tmp[0]; n[1] = tmp[1]; n[2] = tmp[2]; } }
    }
  };
  const G = boxes.grid;
  let i = G ? Math.floor(o[0] / GRID) - G.x0 : -1, j = G ? Math.floor(o[2] / GRID) - G.z0 : -1;
  if (!G || i < 0 || j < 0 || i >= G.nx || j >= G.nz) test(boxes);
  else {   // walk through the cells along the ray until the nearest hit lies behind us
    const si = d[0] > 0 ? 1 : -1, sj = d[2] > 0 ? 1 : -1, di = Math.abs(GRID / d[0]), dj = Math.abs(GRID / d[2]);
    let ti = d[0] ? ((i + G.x0 + (si > 0 ? 1 : 0)) * GRID - o[0]) / d[0] : Infinity, tj = d[2] ? ((j + G.z0 + (sj > 0 ? 1 : 0)) * GRID - o[2]) / d[2] : Infinity;
    for (let enter = 0; enter <= t && i >= 0 && j >= 0 && i < G.nx && j < G.nz;) {
      test(G.cells[i * G.nz + j]);
      if (ti < tj) { enter = ti; ti += di; i += si; } else { enter = tj; tj += dj; j += sj; }
      if (enter === Infinity) break;
    }
  }
  if (d[1] < 0) {
    const g = -o[1] / d[1];
    if (g < t) { t = g; if (n) { n[0] = 0; n[1] = 1; n[2] = 0; } }
  }
  return t;
}

// Thrown grenade: n = {x,y,z,vx,vy,vz}. Call with a fixed small dt so server and clients agree on the path.
export const NADE_DT = 1 / 120;   // short enough that even the thinnest wall is never skipped
const NADE_R = 0.1;
const nadeHit = (x, y, z, boxes) => !!findBox(boxes, x, z, NADE_R, b =>
  x + NADE_R > b.min[0] && x - NADE_R < b.max[0] && y + NADE_R > b.min[1] && y - NADE_R < b.max[1] && z + NADE_R > b.min[2] && z - NADE_R < b.max[2]);
// Where a throw starts, rounded like the message that tells the clients about it.
export function nadeStart(p, yaw, pitch, E) {
  const d = dirFrom(yaw, pitch), v = E.speed || 15, R = x => Math.round(x * 100) / 100;
  return { x: R(p.x), y: R(p.y + Math.max(0.3, stanceEye(p.cr) - 0.1)), z: R(p.z), vx: R(d[0] * v), vy: R(d[1] * v + v / 6), vz: R(d[2] * v) };
}
// Returns true when it touched something.
export function stepNade(n, dt, boxes) {
  let touched = false;
  n.vy -= 14 * dt;
  for (const [k, v] of [['x', 'vx'], ['z', 'vz'], ['y', 'vy']]) {
    const old = n[k];
    n[k] += n[v] * dt;
    const floor = k === 'y' && n.y < NADE_R;
    if (!floor && !nadeHit(n.x, n.y, n.z, boxes)) continue;
    touched = true;
    n[k] = floor ? NADE_R : old;
    if (k === 'y' && n.vy < 0) { n.vx *= 0.75; n.vz *= 0.75; }
    n[v] *= Math.abs(n[v]) < 0.8 ? 0 : -0.45;
  }
  return touched;
}

export const dirFrom = (yaw, pitch) => [
  -Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  -Math.cos(yaw) * Math.cos(pitch),
];

// Head + body hitboxes for a player at s = {x,y,z,yaw,cr}. A lying body stretches along its yaw.
const LYING = [[0.36, 0.24], [-0.15, 0.24], [-0.6, 0.22]];   // [metres forward, half width] of chest, hips, legs
export function hitbox(o, d, s) {
  if (s.cr === 2) {
    const fx = -Math.sin(s.yaw || 0), fz = -Math.cos(s.yaw || 0);
    const at = (f, w, y0, y1) => rayBox(o, d, [s.x + fx * f - w, s.y + y0, s.z + fz * f - w], [s.x + fx * f + w, s.y + y1, s.z + fz * f + w]);
    const head = at(0.82, 0.17, 0.08, 0.5);
    let body = Infinity;
    for (const [f, w] of LYING) body = Math.min(body, at(f, w, 0, 0.42));
    return head <= body ? { t: head, head: head < Infinity } : { t: body, head: false };
  }
  const h = s.cr ? PHYS.hc : PHYS.h;
  const head = rayBox(o, d, [s.x - 0.17, s.y + h - 0.32, s.z - 0.17], [s.x + 0.17, s.y + h + 0.02, s.z + 0.17]);
  const body = rayBox(o, d, [s.x - 0.3, s.y, s.z - 0.3], [s.x + 0.3, s.y + h - 0.32, s.z + 0.3]);
  return head <= body ? { t: head, head: true } : { t: body, head: false };
}
