// War fronts. Unlike the other lands these are not mirrored: Red comes from one side, Blue holds the other.
// whole: every box of the land; blue: Blue's spawns; air: bombers and helicopters take part (see air.js).
// decor is drawn but has no collision. theme.front: what front.js draws around the land (sea, cliffs, ships).
import { stairs, pavilion, spawnLine } from './landkit.js';

// Broken wall from (x0, z0) to (x1, z1): one piece per height, 0 leaves a gap.
function jag(x0, z0, x1, z1, kind, hs) {
  const n = hs.length, dx = (x1 - x0) / n, dz = (z1 - z0) / n, T = 0.6;
  return hs.flatMap((h, i) => h ? [[x0 + dx * (i + 0.5), z0 + dz * (i + 0.5), Math.abs(dx) || T, Math.abs(dz) || T, h, kind]] : []);
}
// Ruined house with its walls on the lines between bot cells, so every gap can be walked through.
const ruin = (x0, z0, x1, z1, kind, { s, n, w, e }) => [...jag(x0, z0, x1, z0, kind, s), ...jag(x0, z1, x1, z1, kind, n), ...jag(x0, z0, x0, z1, kind, w), ...jag(x1, z0, x1, z1, kind, e)];
// Landing craft with its bow open toward +z.
const craft = (x, z) => [[x - 2, z, 0.35, 9, 1.5, 'craft'], [x + 2, z, 0.35, 9, 1.5, 'craft'], [x, z - 4.9, 4.35, 1, 2.2, 'craft']];
const hog = (x, z) => [x, z, 1.3, 1.3, 1.3, 'hedgehog'];
const post = (x, z) => [x, z, 0.35, 0.35, 2.4, 'log'];
const tank = (x, z, turned) => [turned ? [x, z, 6, 3.2, 1.5, 'tank'] : [x, z, 3.2, 6, 1.5, 'tank'], [x, z, 2, 2, 0.75, 'turret', 1.5]];
// Concrete bunker looking at -z through a slit, door at the back.
const bunker = (x, z) => [
  [x, z - 2.8, 9, 0.6, 1, 'wall'], [x, z - 2.8, 9, 0.6, 0.65, 'wall', 1.85], [x - 4.2, z, 0.6, 5, 2.5, 'wall'], [x + 4.2, z, 0.6, 5, 2.5, 'wall'],
  [x - 3, z + 2.8, 3, 0.6, 2.5, 'wall'], [x + 3, z + 2.8, 3, 0.6, 2.5, 'wall'], [x, z, 10, 7, 0.6, 'wall', 2.5],
];
const C = [-30, -9, 9, 30];   // landing craft

export const FRONTS = {
  beach: {
    name: 'Iron Shore', desc: 'A WWII landing under bombers and helicopters', size: [42, 54], air: true, focus: 34,
    spawns: C.flatMap(x => [[x, -44], [x, -47]]),
    blue: spawnLine(50, [-24, -16, -8, 0, 8, 16, 24, 30]),
    whole: [
      /* ---- the sea ---- */
      ...C.flatMap(x => craft(x, -45)),
      [0, -38, 4.4, 8, 2.1, 'craft'], [-20, -39, 5.5, 3, 1.9, 'craft'], [20, -38, 3, 6, 1.9, 'craft'],
      ...[-38, -34, -25, -15, -5, 5, 14, 25, 35, 39].map((x, i) => post(x, -33 - (i % 3))),
      /* ---- the beach ---- */
      ...tank(-19.5, -28.5), ...tank(22, -25, true), [-33, -27, 2.5, 6, 2.3, 'truck'],
      ...[[-38, -30], [-30, -33.5], [-26, -23], [-12, -33], [-9, -27], [-3, -23.5], [4, -29], [9, -33], [12, -22], [30, -33], [32, -26], [37, -21], [-15, -19], [-36, -19], [26, -18.5], [5, -17.5]].map(p => hog(...p)),
      [-9, -21.5, 5, 0.9, 1.05, 'sandbag'], [15, -30, 4, 0.9, 1.05, 'sandbag'], [33, -31, 4, 0.9, 1.05, 'sandbag'], [-27, -28.8, 4, 0.9, 1.05, 'sandbag'],
      [-24, -16.5, 1.2, 1.2, 1.2, 'crate'], [9, -25, 1.2, 1.2, 1.2, 'crate'], [18, -19, 1.2, 1.2, 1.2, 'crate'], [38, -28, 0.8, 0.8, 1.1, 'barrel'], [0, -27, 2, 1.6, 1.4, 'rock'],
      // shingle bank: kneel behind it or jump over
      [-32.5, -13, 19, 1.8, 0.9, 'earth'], [-10.5, -13, 17, 1.8, 0.9, 'earth'], [10.5, -13, 17, 1.8, 0.9, 'earth'], [32.5, -13, 19, 1.8, 0.9, 'earth'],
      /* ---- sea wall with breaches, two bunkers and a firing step ---- */
      [-38.5, -6, 7, 1.2, 2.2, 'wall'], [-28.25, -6, 5.5, 1.2, 2.2, 'wall'], [-15.5, -6, 2, 1.2, 2.2, 'wall'], [0, -6, 19, 1.2, 2, 'wall'], [15.5, -6, 2, 1.2, 2.2, 'wall'], [28.25, -6, 5.5, 1.2, 2.2, 'wall'], [38.5, -6, 7, 1.2, 2.2, 'wall'],
      ...bunker(-21, -4), ...bunker(21, -4),
      [0, -4.5, 17, 1.8, 0.9, 'earth'], ...stairs(0, -3.6, 0, 1, 17, 0.9, 'earth'),
      [-31.2, -8.2, 1.4, 1.4, 0.8, 'rock'], [13.6, -8.4, 1.6, 1.2, 0.8, 'rock'], [-10.2, -7.8, 1.2, 1.4, 0.8, 'rock'],
      /* ---- trenches ---- */
      [-30, 3, 14, 1.4, 1.4, 'earth'], [-12, 3, 14, 1.4, 1.4, 'earth'], [12, 3, 14, 1.4, 1.4, 'earth'], [30, 3, 14, 1.4, 1.4, 'earth'],
      [-22, 9, 16, 1.4, 1.4, 'earth'], [22, 9, 16, 1.4, 1.4, 'earth'], [-37, 6, 1.4, 5, 1.4, 'earth'], [37, 6, 1.4, 5, 1.4, 'earth'],
      [-9, 6, 1.2, 1.2, 1.2, 'crate'], [27, 6, 1.2, 1.2, 1.2, 'crate'], [-27, 6, 0.8, 0.8, 1.1, 'barrel'], [13.5, 6, 0.8, 0.8, 1.1, 'barrel'],
      // field gun in a ring of sandbags
      [0, 8.6, 1.8, 2.6, 1.3, 'cannon'], [0, 5.6, 5, 0.9, 1.05, 'sandbag'], [-4.4, 8.5, 0.9, 5, 1.05, 'sandbag'], [4.4, 8.5, 0.9, 5, 1.05, 'sandbag'],
      /* ---- village ---- */
      ...ruin(-28.5, 16.5, -13.5, 34.5, 'stone', { s: [6, 2.4, 0, 3.6, 6], n: [6, 5, 0, 3, 6], w: [5, 6, 4, 2.2, 5, 6], e: [6, 4.5, 0, 1.1, 0, 6] }),   // church
      [-27, 33, 2.4, 2.4, 11, 'stone'], [-27, 33, 3, 3, 0.5, 'tile', 11], [-21, 31, 3, 1, 1, 'stone'], [-24.5, 24, 2.4, 0.7, 0.9, 'wood'], [-18, 24, 2.4, 0.7, 0.9, 'wood'], [-24.5, 20.5, 2.4, 0.7, 0.9, 'wood'], [-16.2, 28.4, 1.6, 1.4, 0.9, 'rock'],
      ...ruin(10.5, 16.5, 22.5, 25.5, 'brick', { s: [3.4, 1.1, 0, 3.4], n: [3.4, 0, 2.6, 3.4], w: [3.4, 0, 3], e: [3.2, 3.2, 0] }),
      [13.5, 21, 5.4, 8.4, 0.3, 'wood', 3], [19.5, 18.6, 1.2, 1.2, 1.2, 'crate'],
      ...ruin(28.5, 19.5, 37.5, 31.5, 'plaster', { s: [3.2, 0, 2], n: [2.2, 0, 3.2], w: [3.2, 0, 3.2, 1.1], e: [3.2, 3.2, 2.4, 3.2] }),
      [31.5, 27, 1.6, 1.2, 0.9, 'wood'],
      ...ruin(7.5, 31.5, 19.5, 40.5, 'stone', { s: [3, 0, 1.2, 3.4], n: [3.4, 2, 0, 3], w: [3.2, 0, 2.4], e: [1.1, 0, 3.4] }),
      [12, 36.5, 1.2, 1.2, 1.2, 'crate'],
      ...ruin(-40.5, 19.5, -34.5, 28.5, 'plaster', { s: [3, 2.2], n: [1.8, 3], w: [3, 3, 3], e: [3, 0, 3] }),
      ...tank(3, 22.5), [-6, 31, 2.5, 6, 2.3, 'truck'], [27, 37, 6, 2.5, 2.3, 'truck'],
      [-2.2, 14.2, 5, 0.9, 1.05, 'sandbag'], [27, 14, 4, 0.9, 1.05, 'sandbag'], [-33, 13.5, 4, 0.9, 1.05, 'sandbag'], [0, 34.5, 4.5, 0.9, 1.05, 'sandbag'], [-9.5, 26, 0.9, 4, 1.05, 'sandbag'], [25.5, 28, 0.9, 4, 1.05, 'sandbag'],
      [-9, 18, 1.2, 1.2, 1.2, 'crate'], [-9, 18, 1, 1, 1, 'crate', 1.2], [7, 17, 0.8, 0.8, 1.1, 'barrel'], [5.5, 28, 1.8, 1.4, 1, 'rock'], [-33, 33, 1.2, 1.2, 1.2, 'crate'], [38, 15, 2, 1.6, 1.3, 'rock'], [-38, 34.5, 2.2, 1.8, 1.4, 'rock'],
      ...[[-11, 14.5], [6, 13], [-33, 38], [24.5, 33], [38.5, 35], [-38.5, 14], [2, 44.5]].map(([x, z]) => [x, z, 0.6, 0.6, 5, 'snag']),
      /* ---- Blue's camp ---- */
      [-21, 40.5, 9, 1, 1.4, 'hedge'], [-6, 40.5, 9, 1, 1.4, 'hedge'], [31, 41.5, 9, 1, 1.4, 'hedge'], [-36, 41.5, 5, 1, 1.4, 'hedge'],
      [-14, 45.5, 4, 0.9, 1.05, 'sandbag'], [8, 45.5, 4, 0.9, 1.05, 'sandbag'], [22, 45.5, 4, 0.9, 1.05, 'sandbag'], [-28, 45.5, 4, 0.9, 1.05, 'sandbag'],
      [-34, 49, 2.5, 6, 2.3, 'truck'], [37, 47.5, 2.5, 6, 2.3, 'truck'], ...pavilion(-3, 46.5, 6, 4, 0, 2.5, 'wood', 'canvas'), [-4.6, 47, 1.2, 1.2, 1.2, 'crate'],
      [0, 53.6, 84, 0.8, 2.8, 'hedge'],
    ],
    decor: [
      ...C.flatMap(x => [[x, -45, 3.7, 9, 0.1, 'deck'], [x, -39.2, 3.7, 2.8, 0.2, 'ramp']]),
      ...[[-32, -10], [-22, -10.4], [-5, -10.2], [5, -10.2], [22, -10.4], [34, -10], [-26, 0.6], [-3, 0.4], [28, 0.5]].map(([x, z]) => [x, z, 6, 0.9, 0.9, 'wire']),
      ...[[-40.6, -24], [40.6, -22], [-40.6, -2], [40.6, 0], [-40.6, 12]].map(([x, z]) => [x, z, 0.9, 7, 0.9, 'wire']),
      ...[[-6, -30, 3.2], [13, -27, 2.6], [-29, -20, 3.6], [28, -29, 2.4], [0, -18, 2.8], [-37, -14.8, 1.6], [17, -15.5, 1.8], [-20, -21, 2.2], [35, -16.5, 1.7], [-7, 12, 2.2], [17, 12.5, 2.6], [-32, 11, 1.8], [2, 27.5, 2.2], [24, 19, 1.9], [-10, 37, 2], [-24, 37.5, 1.8], [33, 36, 2.2], [-6, 0, 1.9], [9, -0.5, 1.7]].map(([x, z, r]) => [x, z, r * 2, r * 2, 0.06, 'crater']),
    ],
    theme: {
      skyTop: 0x5d7387, skyHor: 0xe0c7a2, fog: [0xc2b49c, 70, 420], hemi: [0xf0e8dc, 0x8d8068, 1.75], sun: [0xffe0b0, 2.9, [-38, 42, -34]],
      ground: ['#c2ab80', '#8f8160', '#b9a377', '#7d7350', '#d0bb92'], perimeter: 0xd6d1c6, wall: 0xb9b6aa, far: ['city', 0], vm: 1,
      // where the sea and the sand end, and what burns: [x, y, z, size]
      front: { sea: -29, sand: -6, fires: [[-19.5, 1.8, -28.5, 1.1], [3, 1.8, 22.5, 1.2], [0, 1.6, -38, 1], [33, 1.5, 24, 1.3], [-120, 8, 110, 3.2], [95, 8, 130, 3.4], [-90, 2, -150, 2.6]] },
    },
  },
};
