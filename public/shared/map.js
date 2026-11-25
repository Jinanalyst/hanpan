// HANPAN map: point-symmetric, (x, z) -> (-x, -z), so both teams get the same layout.
// Units are meters. Red spawns at negative z, Blue at positive z.

// [centerX, centerZ, sizeX, sizeZ, height, kind, baseY]
const HALF = [
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
];

const PERIMETER = [
  [0, -40.5, 82, 1, 5, 'perimeter'], [0, 40.5, 82, 1, 5, 'perimeter'],
  [-40.5, 0, 1, 80, 5, 'perimeter'], [40.5, 0, 1, 80, 5, 'perimeter'],
];

const RAW = [...HALF, ...HALF.map(([x, z, sx, sz, h, k, y]) => [-x, -z, sx, sz, h, k, y]), ...PERIMETER];

export const MAP_SIZE = 80;
export const BOXES = RAW.map(([x, z, sx, sz, h, kind, y0 = 0]) => ({
  min: [x - sx / 2, y0, z - sz / 2],
  max: [x + sx / 2, y0 + h, z + sz / 2],
  kind,
}));

const RED = [[-10, -36], [-4, -36], [4, -36], [10, -36], [-16, -35], [16, -35], [0, -35]];
export const SPAWNS = { red: RED, blue: RED.map(([x, z]) => [-x, -z]) };

// Bot navigation points: a grid of open floor cells.
export const WAYPOINTS = [];
for (let x = -36; x <= 36; x += 4) {
  for (let z = -36; z <= 36; z += 4) {
    const blocked = BOXES.some(b => b.min[1] < 1.5 &&
      x + 0.8 > b.min[0] && x - 0.8 < b.max[0] && z + 0.8 > b.min[2] && z - 0.8 < b.max[2]);
    if (!blocked) WAYPOINTS.push([x, z]);
  }
}
