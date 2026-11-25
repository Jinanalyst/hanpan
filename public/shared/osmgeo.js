// Outlines of a generated city. Used by the drawing code and, without a screen, by the server.

// Daylight that suits the textures of the generated cities.
export const DAY = { sky: 0xc4d6e6, hemi: [0xe6eef6, 0x8c857a, 2.3], sun: [0xfff0d6, 2.9, [70, 130, 45]], fog: [150, 900] };

const RECT = 0.985, CORNER = 0.5;   // an outline is a box when it fills this much of its tightest box and no corner is further off (metres)

// Flat list of whole numbers to points in metres.
export function ring(flat, unit) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i] * unit, flat[i + 1] * unit]);
  return out;
}
export function area(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
}
// Tightest box around an outline: centre, size and angle.
export function fitBox(p) {
  let best = null;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = Math.atan2(p[i][1] - p[j][1], p[i][0] - p[j][0]), c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of p) {
      const u = x * c + z * s, v = z * c - x * s;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const w = u1 - u0, d = v1 - v0;
    if (!best || w * d < best.w * best.d) { const u = (u0 + u1) / 2, v = (v0 + v1) / 2; best = { x: u * c - v * s, z: u * s + v * c, w, d, a }; }
  }
  return best;
}
// True when the box is as good as the outline itself.
export function isBox(p, f) {
  if (area(p) < f.w * f.d * RECT) return false;
  const c = Math.cos(f.a), s = Math.sin(f.a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([i, j]) => {
    const u = i * f.w / 2, v = j * f.d / 2, x = f.x + u * c - v * s, z = f.z + u * s + v * c;
    return p.some(q => Math.hypot(q[0] - x, q[1] - z) < CORNER);
  });
}
// Outline with fewer points, at most tol metres off.
export function simplify(p, tol) {
  const q = [...p];
  for (let again = true; again && q.length > 4;) {
    again = false;
    let bi = -1, bd = tol;
    q.forEach((b, i) => {   // drop the point that matters least
      const a = q.at(i - 1), c = q[(i + 1) % q.length], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz);
      const d = l < 1e-6 ? 0 : Math.abs(dx * (b[1] - a[1]) - dz * (b[0] - a[0])) / l;
      if (d < bd) { bd = d; bi = i; }
    });
    if (bi >= 0) { q.splice(bi, 1); again = true; }
  }
  return q;
}
