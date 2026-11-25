// HANPAN lands. Every land is point-symmetric, (x, z) -> (-x, -z), so both teams get the same layout.
// Units are meters. Red spawns at negative z, Blue at positive z.
// To add a land: add an entry to DEFS (half the boxes are enough, the other half is mirrored) and it shows up
// in the menu, on the server and in the tests.

// Box: [centerX, centerZ, sizeX, sizeZ, height, kind, baseY = 0]

// Walkable steps leading down from a platform edge at (x, z) in direction (dx, dz). H is the climb above baseY.
function stairs(x, z, dx, dz, width, H, kind, baseY = 0) {
  const n = Math.ceil(H / 0.42), rise = H / n, depth = 0.8, out = [];
  for (let i = 1; i < n; i++) {
    const d = (n - i - 0.5) * depth;
    out.push([x + dx * d, z + dz * d, dx ? depth : width, dz ? depth : width, rise * i, kind, baseY]);
  }
  return out;
}
// Market stall: counter, four posts and a cloth roof.
function stall(x, z) {
  const posts = [[-1.5, -0.8], [1.5, -0.8], [-1.5, 0.8], [1.5, 0.8]];
  return [[x, z, 2.6, 0.9, 1.1, 'wood'], [x, z, 3.5, 2.1, 0.15, 'cloth', 2.9], ...posts.map(([a, b]) => [x + a, z + b, 0.14, 0.14, 2.9, 'wood'])];
}
const spawnLine = (z, xs) => xs.map(x => [x, z]);

const DEFS = {
  compound: {
    name: 'Desert Compound', desc: 'Open sand around a walled ruin', size: [40, 40],
    spawns: [[-10, -36], [-4, -36], [4, -36], [10, -36], [-16, -35], [16, -35], [0, -35]],
    half: [
      // central compound (open-roof ruin with doors and side gaps)
      [-4.25, -5, 5.5, 0.4, 3.2, 'wall'], [4.25, -5, 5.5, 0.4, 3.2, 'wall'], [-7, -2.6, 0.4, 5.2, 3.2, 'wall'],
      [-3, -1.6, 1.2, 1.2, 1.2, 'crate'],
      // container yard
      [-20, -12, 2.6, 6.1, 2.6, 'container'], [-20, -12, 2.6, 6.1, 2.6, 'container', 2.6], [24, -15, 6.1, 2.6, 2.6, 'container'],
      // crate stacks
      [-12.6, -3, 1.2, 1.2, 1.2, 'crate'], [-11.4, -3, 1.2, 1.2, 1.2, 'crate'], [-12, -3, 1.2, 1.2, 1.2, 'crate', 1.2],
      [10, -18, 1.2, 1.2, 1.2, 'crate'], [4.5, -12, 1, 1, 1, 'crate'], [-26, -28, 1.2, 1.2, 1.2, 'crate'],
      // low cover
      [0, -20, 7, 0.9, 1.05, 'sandbag'], [-14, -24, 4, 0.9, 1.05, 'sandbag'], [14, -26, 4, 0.9, 1.05, 'sandbag'],
      // flank walls
      [-30, -9, 1, 14, 3, 'wall'], [32, -30, 1, 10, 3, 'wall'],
      // base barriers
      [-6, -31, 4, 0.8, 1.3, 'barrier'], [6, -31, 4, 0.8, 1.3, 'barrier'],
      // barrels
      [-16, -16, 0.8, 0.8, 1.1, 'barrel'], [17, -6, 0.8, 0.8, 1.1, 'barrel'], [-24, -3, 0.8, 0.8, 1.1, 'barrel'],
    ],
    theme: {
      skyTop: 0x4f86c6, skyHor: 0xdce4ea, fog: [0xc9d3dc, 70, 260], hemi: [0xdfe9f5, 0x6b5a40, 1.3], sun: [0xfff0d8, 2.8, [35, 60, 20]],
      ground: ['#a8916b', '#8f7a57', '#b9a37c', '#7d6a4c', '#c4b08a'], perimeter: 0xd6d1c6, wall: 0xffffff, far: ['block', 0x8d8c86], vm: 1,
    },
  },

  harbor: {
    name: 'Harbor Yard', desc: 'Container lanes under the cranes', size: [32, 44],
    spawns: spawnLine(-41, [-20, -12, -6, 0, 6, 12, 20]),
    half: [
      // loading dock in the middle, with steps at both ends
      [0, 0, 10, 6, 1, 'wall'], ...stairs(0, -3, 0, -1, 6, 1, 'wall'), [-2.5, -1.4, 1.2, 1.2, 1.2, 'crate', 1], [3.6, -1.6, 1, 1, 1, 'crate', 1],
      // gantry crane
      [-7, -6, 0.8, 0.8, 9, 'metal'], [7, -6, 0.8, 0.8, 9, 'metal'], [0, -6, 14.8, 0.9, 0.9, 'metal', 9], [-7, 0, 0.7, 11.2, 0.7, 'metal', 9],
      // container lanes
      [-13, -1, 2.6, 6.1, 2.6, 'container'],
      [-10, -14, 2.6, 6.1, 2.6, 'container'], [-10, -14, 2.6, 6.1, 2.6, 'container', 2.6],
      [-1.5, -16, 6.1, 2.6, 2.6, 'container'], [9, -13, 2.6, 6.1, 2.6, 'container'],
      [18, -8, 2.6, 6.1, 2.6, 'container'], [18, -8, 2.6, 6.1, 2.6, 'container', 2.6], [18, -20, 6.1, 2.6, 2.6, 'container'],
      [-20, -8, 2.6, 6.1, 2.6, 'container'], [-20, -20, 6.1, 2.6, 2.6, 'container'], [-20, -20, 6.1, 2.6, 2.6, 'container', 2.6],
      [-27, -2, 2.6, 6.1, 2.6, 'container'], [-27, -14, 2.6, 6.1, 2.6, 'container'], [27, -14, 2.6, 6.1, 2.6, 'container'],
      [4, -25, 6.1, 2.6, 2.6, 'container'], [-9, -28, 2.6, 6.1, 2.6, 'container'], [14, -30, 2.6, 6.1, 2.6, 'container'],
      [-23, -31, 2.6, 6.1, 2.6, 'container'], [24, -29, 6.1, 2.6, 2.6, 'container'],
      // steps up to one container roof per side
      ...stairs(9, -16.05, 0, -1, 1.6, 2.6, 'metal'),
      // small cover
      [-5, -20.5, 1.2, 1.2, 1.2, 'crate'], [5, -9.5, 1.2, 1.2, 1.2, 'crate'], [-15.5, -14, 1.2, 1.2, 1.2, 'crate'], [23, -3, 1.2, 1.2, 1.2, 'crate'],
      [13, -22, 0.8, 0.8, 1.1, 'barrel'], [-25, -24, 0.8, 0.8, 1.1, 'barrel'], [-3, -9, 0.8, 0.8, 1.1, 'barrel'],
      [-5, -36, 4, 0.8, 1.3, 'barrier'], [5, -36, 4, 0.8, 1.3, 'barrier'], [-16, -36, 4, 0.8, 1.3, 'barrier'], [18, -36, 4, 0.8, 1.3, 'barrier'],
    ],
    theme: {
      skyTop: 0x3c4f86, skyHor: 0xf3b27a, fog: [0xd9a98a, 60, 240], hemi: [0xf0d2c0, 0x4a4a55, 1.25], sun: [0xffb878, 2.9, [-55, 32, 18]],
      ground: ['#6f7276', '#62656a', '#7d8085', '#55585c', '#868a8e'], perimeter: 0x9aa3ab, wall: 0xc9ccd0, far: ['block', 0x6b6470], vm: 0.95,
    },
  },

  frost: {
    name: 'Frost Station', desc: 'A research hall in the snow', size: [40, 36],
    spawns: spawnLine(-33.4, [-18, -12, -6, 0, 6, 12, 18]),
    half: [
      // roofed hall with three doors per side
      [-7.25, -7, 5.5, 0.5, 3.4, 'panel'], [2, -7, 6, 0.5, 3.4, 'panel'], [8.75, -7, 2.5, 0.5, 3.4, 'panel'],
      [-9.75, -4, 0.5, 5.5, 3.4, 'panel'], [9.75, -4.5, 0.5, 4.5, 3.4, 'panel'],
      [0, 0, 20.4, 14.9, 0.35, 'metal', 3.4], [0, 0, 2, 2, 3.4, 'metal'],
      [-5, -3, 0.9, 3, 2, 'metal'], [5.5, -3.4, 2, 0.9, 1.1, 'crate'],
      // rocks
      [-20, -14, 5, 4, 3, 'rock'], [-23.5, -12.5, 3, 3, 1.8, 'rock'], [16, -15, 4, 3, 2.4, 'rock'], [29, -9, 4, 5, 3.2, 'rock'],
      [-33, -4, 3, 6, 2.6, 'rock'], [30, -27, 5, 3, 2.2, 'rock'],
      // snowbanks
      [0, -16, 8, 1.4, 1.05, 'snow'], [-12, -22, 5, 1.4, 1.05, 'snow'], [11, -23, 5, 1.4, 1.05, 'snow'], [23, -21, 1.4, 6, 1.05, 'snow'],
      [-15, -6, 1.4, 5, 1.05, 'snow'],
      // pipeline
      [19, -2, 1, 8, 1.1, 'metal'],
      // lookout with a parapet
      [-31, -20, 5, 5, 2, 'wood'], [-31, -17.7, 5, 0.4, 0.9, 'wood', 2], [-33.3, -20.2, 0.4, 4.6, 0.9, 'wood', 2], ...stairs(-28.5, -20, 1, 0, 2, 2, 'wood'),
      // huts and supplies
      [8, -28.5, 6.1, 2.6, 2.6, 'container'], [-9, -28.5, 6.1, 2.6, 2.6, 'container'], [0, -28, 1.2, 1.2, 1.2, 'crate'],
      [-22, -29, 4, 0.8, 1.3, 'barrier'], [20, -29, 4, 0.8, 1.3, 'barrier'],
      [5, -12, 0.8, 0.8, 1.1, 'barrel'], [-6, -11, 0.8, 0.8, 1.1, 'barrel'],
    ],
    theme: {
      skyTop: 0x8fa9c4, skyHor: 0xe9eff4, fog: [0xdde6ee, 40, 170], hemi: [0xeaf2ff, 0x9fb0c2, 1.35], sun: [0xf4f7ff, 1.9, [-30, 50, -25]],
      ground: ['#e4ebf1', '#d6dfe8', '#f2f6f9', '#cbd6e0', '#eef3f7'], perimeter: 0xc8d4de, wall: 0xdfe6ec, far: ['peak', 0xb9c7d4], snow: true, vm: 1,
    },
  },

  market: {
    name: 'Night Market', desc: 'Tight neon streets after dark', size: [34, 42],
    spawns: spawnLine(-38.5, [-18, -12, -6, 0, 6, 12, 18]),
    half: [
      // city blocks
      [-22, -20, 12, 10, 6, 'brick'], [-4, -24, 10, 8, 6, 'brick'], [14, -21, 12, 10, 6, 'brick'], [29, -12, 6, 14, 6, 'brick'],
      [-16, -5, 8, 10, 5, 'brick'], [-29, -3, 5, 10, 6, 'brick'], [12, -9, 6, 5, 4, 'brick'],
      // plaza stage
      [0, 0, 7, 7, 0.4, 'wall'], [0, 0, 1.8, 1.8, 3.4, 'wall', 0.4], [0, 0, 2, 2, 0.5, 'neonC', 3.8],
      // stalls
      ...stall(-6, -7), ...stall(4.5, -13), ...stall(-11, -13), ...stall(22.5, -2.5), ...stall(-12, -31),
      // balcony with steps
      [6.5, -20.5, 3, 4, 2.4, 'metal'], [5.15, -20.5, 0.3, 4, 0.9, 'metal', 2.4], ...stairs(6.5, -18.5, 0, 1, 2, 2.4, 'metal'),
      // parked vans and street cover
      [-12.5, -22, 2.2, 4.6, 2, 'container'], [23.5, -24, 2.2, 4.6, 2, 'container'], [4, -30.5, 4.6, 2.2, 2, 'container'],
      [-30, -14, 1.2, 1.2, 1.2, 'crate'], [0.5, -8.5, 1.2, 1.2, 1.2, 'crate'], [22.5, -10, 1.2, 1.2, 1.2, 'crate'], [-9, -18, 0.8, 0.8, 1.1, 'barrel'], [16, -13.5, 0.8, 0.8, 1.1, 'barrel'],
      [-24, -29, 4, 0.8, 1.3, 'barrier'], [16, -32, 4, 0.8, 1.3, 'barrier'], [-3, -34, 4, 0.8, 1.3, 'barrier'],
      // neon signs (above head height)
      [-4, -19.9, 5, 0.2, 0.7, 'neonM', 3.6], [-15.9, -20, 0.2, 5, 0.7, 'neonC', 3.6], [14, -15.9, 6, 0.2, 0.7, 'neonY', 3.6],
      [-11.9, -5, 0.2, 5, 0.8, 'neonM', 3.4], [25.9, -12, 0.2, 5, 0.7, 'neonC', 3.6], [12, -6.4, 4, 0.2, 0.5, 'neonY', 3],
    ],
    lights: [[-4, 4, -17.5, 0xff4fa8], [-13.5, 4, -19, 0x3fd8ff], [14, 4, -13.5, 0xffd24a], [0, 5, -4, 0x6fe0ff]],
    theme: {
      skyTop: 0x0b1030, skyHor: 0x3a2a55, fog: [0x2a2444, 45, 200], hemi: [0xb4bcf0, 0x6a6080, 2.6], sun: [0xb8c4ff, 1.9, [25, 55, -30]],
      ground: ['#4b4c55', '#3f4049', '#575963', '#363740', '#62646e'], perimeter: 0x6f6a7c, wall: 0xa9a6b5, far: ['tower', 0x2c2a40], vm: 0.9,
    },
  },

  ruins: {
    name: 'Jungle Ruins', desc: 'Climb the stone terraces', size: [38, 38],
    spawns: spawnLine(-35, [-16, -10, -5, 0, 5, 10, 16]),
    half: [
      // three-level terrace with stairs on all four sides
      [0, 0, 20, 20, 1.2, 'stone'], [0, 0, 13, 13, 1.2, 'stone', 1.2], [0, 0, 6, 6, 1.2, 'stone', 2.4],
      ...stairs(0, -10, 0, -1, 4, 1.2, 'stone'), ...stairs(0, -6.5, 0, -1, 3, 1.2, 'stone', 1.2), ...stairs(0, -3, 0, -1, 2, 1.2, 'stone', 2.4),
      ...stairs(-10, 0, -1, 0, 4, 1.2, 'stone'), ...stairs(-6.5, 0, -1, 0, 3, 1.2, 'stone', 1.2),
      [-2.1, -2.7, 1.4, 0.4, 0.9, 'stone', 3.6], [2.1, -2.7, 1.4, 0.4, 0.9, 'stone', 3.6], [-8, -8, 1.4, 1.4, 1.3, 'stone', 1.2], [8, -8, 1.4, 1.4, 1.3, 'stone', 1.2],
      // gate
      [-8, -21, 1.2, 1.2, 4, 'stone'], [-2.6, -21, 1.2, 1.2, 4, 'stone'], [2.6, -21, 1.2, 1.2, 4, 'stone'], [8, -21, 1.2, 1.2, 4, 'stone'], [0, -21, 17.2, 1.3, 0.7, 'stone', 4],
      // broken walls
      [-20, -15, 8, 0.8, 2.6, 'stone'], [-24.4, -11, 0.8, 8, 2.6, 'stone'], [18, -18, 0.8, 9, 3, 'stone'], [23, -13.9, 9, 0.8, 2.2, 'stone'],
      [-30, -22, 0.8, 8, 2, 'stone'], [31, -24, 6, 0.8, 2, 'stone'], [-17, -4, 0.8, 5, 1.3, 'stone'],
      // rocks, logs, trees
      [26, -5, 4, 3, 2, 'rock'], [-32, -5, 3, 4, 2.6, 'rock'], [-10, -28, 3, 2.4, 1.6, 'rock'],
      [0, -28, 7, 0.9, 0.9, 'wood'], [13, -27, 0.9, 5, 0.9, 'wood'], [-22, -28, 5, 0.9, 0.9, 'wood'],
      [-30, -30, 0.7, 0.7, 6, 'tree'], [26, -31, 0.7, 0.7, 6, 'tree'], [-16, -23, 0.7, 0.7, 6, 'tree'], [33, -13, 0.7, 0.7, 6, 'tree'], [-34, -13, 0.7, 0.7, 6, 'tree'], [13, -14, 0.7, 0.7, 6, 'tree'],
    ],
    theme: {
      skyTop: 0x4a93b8, skyHor: 0xdcebd0, fog: [0xbfd3b8, 50, 190], hemi: [0xe6f5dc, 0x4c5a34, 1.3], sun: [0xfff2c4, 2.6, [28, 58, -22]],
      ground: ['#5f7340', '#52663a', '#6d8249', '#7a6f45', '#48592f'], perimeter: 0x9ba488, wall: 0xd0d2bd, far: ['peak', 0x55703f], vm: 1,
    },
  },
};

export const DEFAULT_MAP = 'compound';
export const MAP_IDS = Object.keys(DEFS);
export const MAP_LIST = MAP_IDS.map(id => ({ id, name: DEFS[id].name, desc: DEFS[id].desc }));
export const isMap = id => typeof id === 'string' && Object.hasOwn(DEFS, id);
export const randomMap = () => MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)];

const built = {};
// Returns the built land. Unknown ids fall back to the default one.
export function getMap(id) {
  if (!isMap(id)) id = DEFAULT_MAP;
  return built[id] || (built[id] = build(id, DEFS[id]));
}

function build(id, def) {
  const [hx, hz] = def.size;
  const mirrored = def.half.filter(([x, z]) => x || z).map(([x, z, ...rest]) => [-x, -z, ...rest]);
  const raw = [
    ...def.half, ...mirrored,
    [0, -hz - 0.5, hx * 2 + 2, 1, 5, 'perimeter'], [0, hz + 0.5, hx * 2 + 2, 1, 5, 'perimeter'],
    [-hx - 0.5, 0, 1, hz * 2, 5, 'perimeter'], [hx + 0.5, 0, 1, hz * 2, 5, 'perimeter'],
  ];
  const boxes = raw.map(([x, z, sx, sz, h, kind, y0 = 0]) => ({
    min: [x - sx / 2, y0, z - sz / 2],
    max: [x + sx / 2, y0 + h, z + sz / 2],
    kind,
  }));
  const lights = (def.lights || []).flatMap(([x, y, z, c]) => [[x, y, z, c], [-x, y, -z, c]]);
  return {
    id, name: def.name, desc: def.desc, size: def.size, theme: def.theme, lights, boxes,
    spawns: { red: def.spawns, blue: def.spawns.map(([x, z]) => [-x, -z]) },
    nav: buildNav(boxes, hx, hz),
  };
}

/* ---- bot navigation: a grid of open floor cells linked where a bot can walk straight between them ---- */
const CELL = 3;
const solid = (boxes, x, z, r) => boxes.some(b => b.min[1] < 1.75 && b.max[1] > 0.5 &&
  x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2]);

function clearWalk(boxes, x0, z0, x1, z1) {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4);
  for (let i = 1; i < n; i++) if (solid(boxes, x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, 0.42)) return false;
  return true;
}

function buildNav(boxes, hx, hz) {
  const pts = [], at = new Map();
  const nx = Math.floor((hx - 1.5) / CELL), nz = Math.floor((hz - 1.5) / CELL);
  for (let i = -nx; i <= nx; i++) for (let j = -nz; j <= nz; j++) {
    if (solid(boxes, i * CELL, j * CELL, 0.6)) continue;
    at.set(i + ',' + j, pts.length);
    pts.push([i * CELL, j * CELL, i, j]);
  }
  const links = pts.map(([x, z, i, j]) => {
    const out = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const k = a || b ? at.get((i + a) + ',' + (j + b)) : undefined;
      if (k !== undefined && clearWalk(boxes, x, z, pts[k][0], pts[k][1])) out.push(k);
    }
    return out;
  });
  // keep only the largest connected area so bots never aim for a sealed pocket
  const seen = new Array(pts.length).fill(false);
  let main = [];
  for (let s = 0; s < pts.length; s++) {
    if (seen[s]) continue;
    const comp = [s]; seen[s] = true;
    for (let q = 0; q < comp.length; q++) for (const k of links[comp[q]]) if (!seen[k]) { seen[k] = true; comp.push(k); }
    if (comp.length > main.length) main = comp;
  }
  return { points: pts.map(p => [p[0], p[1]]), links, main };
}

// Route from (x, z) to a random reachable point, as a list of [x, z] to walk through.
export function randomRoute(map, x, z) {
  const { points, links, main } = map.nav;
  const near = [...main].sort((a, b) => Math.hypot(points[a][0] - x, points[a][1] - z) - Math.hypot(points[b][0] - x, points[b][1] - z)).slice(0, 8);
  const start = near.find(k => clearWalk(map.boxes, x, z, points[k][0], points[k][1])) ?? near[0];
  const goal = main[Math.floor(Math.random() * main.length)];
  const prev = new Map([[start, -1]]), queue = [start];
  for (let q = 0; q < queue.length && !prev.has(goal); q++) {
    const ks = links[queue[q]], o = Math.floor(Math.random() * ks.length);   // random order varies the routes
    for (let i = 0; i < ks.length; i++) { const k = ks[(i + o) % ks.length]; if (!prev.has(k)) { prev.set(k, queue[q]); queue.push(k); } }
  }
  const route = [];
  for (let k = goal; k !== -1 && k !== undefined; k = prev.get(k)) route.unshift(points[k]);
  return route;
}
