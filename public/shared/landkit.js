// Pieces shared by the lands. Box: [centerX, centerZ, sizeX, sizeZ, height, kind, baseY = 0]

// Walkable steps leading down from a platform edge at (x, z) in direction (dx, dz). H is the climb above baseY.
export function stairs(x, z, dx, dz, width, H, kind, baseY = 0) {
  const n = Math.ceil(H / 0.42), rise = H / n, depth = 0.8, out = [];
  for (let i = 1; i < n; i++) {
    const d = (n - i - 0.5) * depth;
    out.push([x + dx * d, z + dz * d, dx ? depth : width, dz ? depth : width, rise * i, kind, baseY]);
  }
  return out;
}
// Market stall: counter, four posts and a cloth roof.
export function stall(x, z) {
  const posts = [[-1.5, -0.8], [1.5, -0.8], [-1.5, 0.8], [1.5, 0.8]];
  return [[x, z, 2.6, 0.9, 1.1, 'wood'], [x, z, 3.5, 2.1, 0.15, 'cloth', 2.9], ...posts.map(([a, b]) => [x + a, z + b, 0.14, 0.14, 2.9, 'wood'])];
}
// Four posts and a flat roof, standing on a floor at height y.
export function pavilion(x, z, w, d, y, h, post, roof) {
  const p = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [x + a * (w / 2 - 0.5), z + b * (d / 2 - 0.5), 0.6, 0.6, h, post, y]);
  return [...p, [x, z, w + 1.4, d + 1.4, 0.4, roof, y + h], [x, z, w * 0.6, d * 0.6, 0.6, roof, y + h + 0.4]];
}
export const spawnLine = (z, xs) => xs.map(x => [x, z]);

/* ---- city pieces ---- */
// Parked car, pointing along z (or along x when turned). color is a hex string.
export function car(x, z, color, turned) {
  const b = (w, d, h, kind, y, o = 0) => (turned ? [x + o, z, d, w, h, kind, y] : [x, z + o, w, d, h, kind, y]);
  return [b(1.9, 4.4, 0.85, 'car-' + color, 0), b(1.65, 2.3, 0.6, 'carglass', 0.85, 0.15)];
}
export const bus = (x, z, color, turned, h = 2.9) => [turned ? [x, z, 9, 2.5, h, 'bus-' + color] : [x, z, 2.5, 9, h, 'bus-' + color]];
export const lamp = (x, z) => [[x, z, 0.2, 0.2, 5, 'metal']];
// Low house with a tiled roof.
export const hanok = (x, z, w, d) => [[x, z, w, d, 2.7, 'plaster'], [x, z, w + 1.6, d + 1.6, 0.35, 'tile', 2.7], [x, z, w * 0.75, d * 0.6, 0.45, 'tile', 3.05], [x, z, w * 0.6, d * 0.25, 0.4, 'tile', 3.5]];
// Subway entrance: railings on three sides, open to +z.
export const subway = (x, z) => [[x - 1.5, z, 0.3, 4, 1.15, 'metal'], [x + 1.5, z, 0.3, 4, 1.15, 'metal'], [x, z - 2, 3.3, 0.3, 1.15, 'metal'], [x - 1.5, z - 2, 0.3, 0.3, 3, 'metal']];

// Looks only, no collision.
export function zebra(x, z, w, d, across) {   // stripes of a crossing; across = stripes lie next to each other along z
  const out = [], n = Math.floor((across ? d : w) / 1.1);
  for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 1.1; out.push(across ? [x, z + o, w, 0.55, 0.04, 'paint'] : [x + o, z, 0.55, d, 0.04, 'paint']); }
  return out;
}
export function lane(x, z0, z1) {   // dashed line along z
  const out = [];
  for (let z = z0 + 1; z < z1; z += 4) out.push([x, z, 0.16, 2, 0.035, 'paint']);
  return out;
}
export const walk = (x, z, w, d) => [x, z, w + 4, d + 4, 0.025, 'paving'];   // pavement around a block of w by d
