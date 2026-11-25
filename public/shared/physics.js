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
  ads: 3,
  step: 0.5,      // auto step-up height
};

function overlaps(x, y, z, h, b) {
  return x + PHYS.r > b.min[0] && x - PHYS.r < b.max[0] &&
         z + PHYS.r > b.min[2] && z - PHYS.r < b.max[2] &&
         y + h > b.min[1] && y < b.max[1];
}

export function hits(x, y, z, h, boxes) {
  for (const b of boxes) if (overlaps(x, y, z, h, b)) return b;
  return null;
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
  const h = p.cr ? PHYS.hc : PHYS.h;
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
  for (const b of boxes) {
    const h = rayBox(o, d, b.min, b.max, tmp);
    if (h < t) { t = h; if (n) { n[0] = tmp[0]; n[1] = tmp[1]; n[2] = tmp[2]; } }
  }
  if (d[1] < 0) {
    const g = -o[1] / d[1];
    if (g < t) { t = g; if (n) { n[0] = 0; n[1] = 1; n[2] = 0; } }
  }
  return t;
}

export const dirFrom = (yaw, pitch) => [
  -Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  -Math.cos(yaw) * Math.cos(pitch),
];

// Head + body hitboxes for a player standing at s = {x,y,z,cr}
export function hitbox(o, d, s) {
  const h = s.cr ? PHYS.hc : PHYS.h;
  const head = rayBox(o, d, [s.x - 0.17, s.y + h - 0.32, s.z - 0.17], [s.x + 0.17, s.y + h + 0.02, s.z + 0.17]);
  const body = rayBox(o, d, [s.x - 0.3, s.y, s.z - 0.3], [s.x + 0.3, s.y + h - 0.32, s.z + 0.3]);
  return head <= body ? { t: head, head: true } : { t: body, head: false };
}
