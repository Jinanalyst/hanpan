// HANPAN lands. Every land is point-symmetric, (x, z) -> (-x, -z), so both teams get the same layout.
// The only exceptions are the war fronts (fronts.js), where one side attacks and the other defends.
// Units are meters. Red spawns at negative z, Blue at positive z.
// To add a land: add an entry to FIELDS here or CITIES in cities.js (half the boxes are enough, the other half is mirrored) and it shows up
// in the menu, on the server and in the tests.

// Box: [centerX, centerZ, sizeX, sizeZ, height, kind, baseY = 0]

import { stairs, stall, pavilion, spawnLine } from './landkit.js';
import { CITIES } from './cities.js';
import { FRONTS } from './fronts.js';
import { REAL } from './realcities.js';
import { DAY } from './osmgeo.js';
import { boxGrid, findBox } from './physics.js';

const FIELDS = {
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
      ground: ['#e4ebf1', '#d6dfe8', '#f2f6f9', '#cbd6e0', '#eef3f7'], perimeter: 0xc8d4de, wall: 0xdfe6ec, far: ['peak', 0xb9c7d4], particles: { color: 0xffffff, fall: 2.2, size: 0.09 }, vm: 1,
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

  /* ---- paid lands: product is the store id ---- */
  orbital: {
    name: 'Orbital Dock', desc: 'A space station under the stars', size: [36, 40], product: 'land:orbital',
    spawns: spawnLine(-37, [-18, -12, -6, 0, 6, 12, 18]),
    half: [
      // reactor
      [0, 0, 9, 9, 0.4, 'hull'], [0, 0, 2.6, 2.6, 4.6, 'hull', 0.4], [0, 0, 2, 2, 1, 'neonC', 5],
      // bulkheads
      [-12, -8, 0.6, 12, 3.2, 'hull'], [12, -9, 0.6, 10, 3.2, 'hull'], [-6, -14, 9, 0.6, 3.2, 'hull'], [7, -16, 8, 0.6, 3.2, 'hull'],
      [-12, -8, 0.7, 11, 0.15, 'neonC', 2.6], [12, -9, 0.7, 9, 0.15, 'neonM', 2.6], [7, -16, 7, 0.7, 0.15, 'neonC', 2.6],
      // roofed tunnel on the flank
      [-25, -14, 0.5, 14, 3, 'hull'], [-19, -16, 0.5, 8, 3, 'hull'], [-22, -14, 6.5, 14, 0.3, 'hull', 3],
      // raised gallery
      [26, -4, 5, 6, 2, 'metal'], [26, -6.8, 5, 0.4, 0.9, 'hull', 2], ...stairs(23.5, -4, -1, 0, 2.4, 2, 'metal'),
      // fuel tanks and cargo
      [21, -14, 4, 4, 3.4, 'metal'], [30, -18, 3, 6, 2.6, 'container'], [-30, -27, 6.1, 2.6, 2.6, 'container'], [25, -30, 6.1, 2.6, 2.6, 'container'],
      [-4.5, -8, 1.2, 1.2, 1.2, 'crate'], [5, -8, 1.2, 1.2, 1.2, 'crate'], [-15, -21, 1.2, 1.2, 1.2, 'crate'], [15.5, -23, 1.2, 1.2, 1.2, 'crate'], [-31, -6, 1.2, 1.2, 1.2, 'crate'],
      [0, -21, 6, 0.9, 1.05, 'hull'], [-9, -27, 4, 0.9, 1.05, 'hull'], [9, -27, 4, 0.9, 1.05, 'hull'], [-18, -5, 0.9, 4, 1.05, 'hull'],
      [-4, -33, 4, 0.8, 1.3, 'barrier'], [14, -33, 4, 0.8, 1.3, 'barrier'], [-17, -33, 4, 0.8, 1.3, 'barrier'],
      [17, -5, 0.8, 0.8, 1.1, 'barrel'], [-28, -20, 0.8, 0.8, 1.1, 'barrel'],
    ],
    lights: [[0, 4, -7, 0x6fe0ff], [-14, 4, -12, 0x6fe0ff], [14, 4, -9, 0xff6fc0]],
    theme: {
      skyTop: 0x020308, skyHor: 0x141d38, fog: [0x10172b, 60, 260], hemi: [0xbccbf2, 0x555c74, 2.4], sun: [0xe6eeff, 2.2, [40, 50, -25]],
      ground: ['#6c7480', '#626a76', '#777f8b', '#59616d', '#828a96'], perimeter: 0x7a8496, wall: 0xc2cad6, far: ['tower', 0x232b40], stars: true, vm: 0.95,
    },
  },

  foundry: {
    name: 'Ember Foundry', desc: 'Molten vats and falling ash', size: [34, 42], product: 'land:foundry',
    spawns: spawnLine(-39, [-20, -13, -6, 0, 6, 13, 20]),
    half: [
      // crucible and gantry
      [0, 0, 5, 5, 2.4, 'basalt'], [0, 0, 4, 4, 0.12, 'lava', 2.4], [-5.5, -5, 1, 1, 6, 'metal'], [5.5, -5, 1, 1, 6, 'metal'], [0, -5, 12, 0.9, 0.8, 'metal', 6], [-5.5, 0, 0.7, 9.1, 0.7, 'metal', 6],
      // vats (too high to jump into)
      [-14, -10, 6, 5, 1.4, 'basalt'], [-14, -10, 5, 4, 0.1, 'lava', 1.4], [15, -13, 5, 6, 1.4, 'basalt'], [15, -13, 4, 5, 0.1, 'lava', 1.4],
      // brick halls
      [-24, -16, 8, 0.8, 3.4, 'brick'], [-19.6, -20, 0.8, 8.8, 3.4, 'brick'], [24, -21, 0.8, 10, 3.4, 'brick'], [21, -4, 8, 0.8, 3, 'brick'], [-25, -3, 0.8, 8, 3, 'brick'],
      // furnace
      [7, -25, 4, 4, 5, 'brick'], [7, -25, 1.6, 1.6, 4, 'basalt', 5], [7, -22.95, 1.8, 0.1, 1.2, 'lava', 0.4],
      // catwalk
      [-8, -21, 8, 3, 2.2, 'metal'], [-8, -19.7, 8, 0.3, 0.9, 'metal', 2.2], ...stairs(-4, -21, 1, 0, 2.2, 2.2, 'metal'),
      // cover
      [-15, -31, 6.1, 2.6, 2.6, 'container'], [18, -31, 6.1, 2.6, 2.6, 'container'], [29, -11, 2.6, 6.1, 2.6, 'container'],
      [-7, -12, 1.2, 1.2, 1.2, 'crate'], [8, -8.5, 1.2, 1.2, 1.2, 'crate'], [4, -16, 1.2, 1.2, 1.2, 'crate'], [-29, -10, 1.2, 1.2, 1.2, 'crate'], [28, -27, 1.2, 1.2, 1.2, 'crate'],
      [0, -11, 4, 0.9, 1.05, 'sandbag'], [-27, -25, 4, 0.9, 1.05, 'sandbag'], [-18, -3, 0.9, 4, 1.05, 'sandbag'],
      [0, -33, 4, 0.8, 1.3, 'barrier'], [-25, -35, 4, 0.8, 1.3, 'barrier'], [9, -35, 4, 0.8, 1.3, 'barrier'],
      [11, -19, 0.8, 0.8, 1.1, 'barrel'], [-22, -22, 0.8, 0.8, 1.1, 'barrel'], [12, -2.5, 0.8, 0.8, 1.1, 'barrel'],
    ],
    lights: [[-14, 3, -10, 0xff7a2a], [15, 3, -13, 0xff7a2a], [0, 4.5, -3, 0xff9a3a], [7, 2, -21, 0xff7a2a]],
    theme: {
      skyTop: 0x2a0f12, skyHor: 0x9a3a1e, fog: [0x6b2c1c, 45, 190], hemi: [0xffc9a6, 0x5a3a34, 1.9], sun: [0xffa066, 2.0, [-30, 45, 25]],
      ground: ['#4a4340', '#403936', '#564e4a', '#352f2d', '#625955'], perimeter: 0x7a625a, wall: 0xb39c92, far: ['peak', 0x35201d], particles: { color: 0xffa050, fall: -1.4, size: 0.07 }, vm: 0.9,
    },
  },

  palace: {
    name: 'Blossom Palace', desc: 'Painted halls among pink trees', size: [40, 38], product: 'land:palace',
    spawns: spawnLine(-35, [-18, -12, -6, 0, 6, 12, 18]),
    half: [
      // great hall
      [0, 0, 14, 10, 0.8, 'stone'], ...stairs(0, -5, 0, -1, 5, 0.8, 'stone'), ...stairs(-7, 0, -1, 0, 4, 0.8, 'stone'),
      [-5.5, -3.8, 0.7, 0.7, 3.6, 'redwood', 0.8], [-2, -3.8, 0.7, 0.7, 3.6, 'redwood', 0.8], [2, -3.8, 0.7, 0.7, 3.6, 'redwood', 0.8], [5.5, -3.8, 0.7, 0.7, 3.6, 'redwood', 0.8],
      [0, 0, 16.5, 12.5, 0.5, 'tile', 4.4], [0, 0, 11.5, 8.5, 0.7, 'tile', 4.9], [0, 0, 6, 4, 0.6, 'tile', 5.6], [0, 0, 4, 0.4, 2, 'redwood', 0.8],
      // gate
      [-3.5, -20, 0.8, 0.8, 4, 'redwood'], [3.5, -20, 0.8, 0.8, 4, 'redwood'], [0, -20, 10, 2.6, 0.4, 'tile', 4], [0, -20, 7, 1.4, 0.5, 'tile', 4.4],
      [-9, -20, 9, 0.7, 2.6, 'plaster'], [-9, -20, 9.2, 1.1, 0.25, 'tile', 2.6], [9, -20, 9, 0.7, 2.6, 'plaster'], [9, -20, 9.2, 1.1, 0.25, 'tile', 2.6],
      // courtyard walls
      [-20, -12, 10, 0.7, 2.4, 'plaster'], [-20, -12, 10.2, 1.1, 0.25, 'tile', 2.4], [21, -13, 9, 0.7, 2.4, 'plaster'], [21, -13, 9.2, 1.1, 0.25, 'tile', 2.4],
      [-29, -6, 0.7, 9, 2.4, 'plaster'], [-29, -6, 1.1, 9.2, 0.25, 'tile', 2.4], [29, -5, 0.7, 8, 2.4, 'plaster'], [29, -5, 1.1, 8.2, 0.25, 'tile', 2.4],
      // side pavilion
      [-28, -24, 7, 6, 1.2, 'stone'], ...stairs(-24.5, -24, 1, 0, 2.6, 1.2, 'stone'), ...pavilion(-28, -24, 7, 6, 1.2, 3, 'redwood', 'tile'), [-28, -21.2, 4, 0.4, 0.9, 'redwood', 1.2],
      // hedges, lanterns, rocks
      [0, -12, 6, 1, 1.05, 'hedge'], [-13, -27, 5, 1, 1.05, 'hedge'], [14, -27, 5, 1, 1.05, 'hedge'], [15, -5, 1, 5, 1.05, 'hedge'], [-14, -5, 1, 5, 1.05, 'hedge'],
      [-6, -15, 0.8, 0.8, 1.3, 'stone'], [6, -15, 0.8, 0.8, 1.3, 'stone'], [24, -7, 0.8, 0.8, 1.3, 'stone'], [-23, -5, 0.8, 0.8, 1.3, 'stone'],
      [27, -22, 4, 3, 2, 'rock'], [34, -12, 3, 4, 2.4, 'rock'], [-35, -14, 3, 3, 2, 'rock'],
      [0, -29, 4, 0.8, 1.3, 'stone'], [-22, -31, 4, 0.8, 1.3, 'stone'], [22, -31, 4, 0.8, 1.3, 'stone'],
      [-18, -18, 0.7, 0.7, 5, 'blossom'], [17, -19, 0.7, 0.7, 5, 'blossom'], [33, -28, 0.7, 0.7, 5, 'blossom'], [-34, -31, 0.7, 0.7, 5, 'blossom'], [11, -10, 0.7, 0.7, 5, 'blossom'], [-35, -3, 0.7, 0.7, 5, 'blossom'],
    ],
    theme: {
      skyTop: 0x6f9fd0, skyHor: 0xf6dfe4, fog: [0xead6dc, 55, 210], hemi: [0xfff0f2, 0x6a6a50, 1.35], sun: [0xffe9d0, 2.5, [32, 52, 24]],
      ground: ['#a79f8a', '#9a927d', '#b3ab96', '#8d8671', '#c9a9a9'], perimeter: 0xd8cfc0, wall: 0xe6ded0, far: ['peak', 0x7d8c72], particles: { color: 0xffc4d6, fall: 0.8, size: 0.1 }, vm: 1,
    },
  },
};

const { compound, ...REST } = FIELDS;
const DEFS = { compound, ...FRONTS, ...REST, ...CITIES };
export const DEFAULT_MAP = 'compound';
export const MAP_IDS = Object.keys(DEFS);
export const MAP_LIST = MAP_IDS.map(id => ({ id, name: DEFS[id].name, desc: DEFS[id].desc, product: DEFS[id].product, city: Object.hasOwn(CITIES, id) })).concat(REAL.map(({ id, name, desc }) => ({ id, name, desc, city: true, real: true })));
// Lands made from real city blocks (tools/osm). Their data is a file of its own: load it, then call addCity with it.
export const isReal = id => REAL.some(c => c.id === id);
export const isMap = id => typeof id === 'string' && (Object.hasOwn(DEFS, id) || isReal(id));
export const isReady = id => isMap(id) && (!isReal(id) || !!built[id]);
// Is this land free, or owned? owned is a Set of store product ids.
export const canPlay = (id, owned) => isMap(id) && (!DEFS[id]?.product || !!owned?.has(DEFS[id].product));
export function randomMap(owned) {
  const ids = [...MAP_IDS, ...REAL.map(c => c.id).filter(isReady)].filter(id => canPlay(id, owned));
  return ids[Math.floor(Math.random() * ids.length)];
}

const built = {};
// Returns the built land. Unknown ids fall back to the default one. A real city that is not loaded yet only has a plan to show.
export function getMap(id) {
  if (!isMap(id)) id = DEFAULT_MAP;
  if (!isReady(id)) return planOf(REAL.find(c => c.id === id));
  return built[id] || (built[id] = build(id, DEFS[id]));
}

const REAL_THEME = {
  skyTop: 0x6f9fd0, skyHor: DAY.sky, fog: [DAY.sky, 120, 620], hemi: DAY.hemi, sun: DAY.sun,
  ground: ['#a9a69c', '#9c998f', '#b4b1a7', '#8f8c83', '#bfbcb2'], perimeter: 0xd6d1c6, wall: 0xffffff, far: ['city', 0], vm: 1,
};
const planOf = c => ({ id: c.id, name: c.name, desc: c.desc, size: [c.half, c.half], theme: REAL_THEME, boxes: c.plan.map(([a, b, d, e]) => ({ min: [a, 0, b], max: [d, 9, e], kind: 'building' })), decor: [], lights: [], spawns: { red: [], blue: [] } });
// Registers the data of a real city and returns its land.
export function addCity(data) {
  const { half, solids, props, spawns } = data.arena;
  const boxes = boxGrid([
    ...solids.map(([x0, z0, x1, z1, h, y]) => ({ min: [x0, y, z0], max: [x1, h, z1], kind: 'building' })),
    ...props.map(([x, z, sx, sz, h, kind, y = 0]) => ({ min: [x - sx / 2, y, z - sz / 2], max: [x + sx / 2, y + h, z + sz / 2], kind })),
  ]);
  let nav = null;
  return (built[data.id] = {
    id: data.id, name: data.name, desc: data.desc, size: [half, half], theme: REAL_THEME, boxes, decor: [], lights: [], spawns, city: data, focus: half * 0.5,
    get nav() { return nav || (nav = buildNav(boxes, half, half)); },   // only where bots run
  });
}

function build(id, def) {
  const [hx, hz] = def.size;
  const both = list => [...list, ...list.filter(([x, z]) => x || z).map(([x, z, ...rest]) => [-x, -z, ...rest])];
  const raw = [
    ...(def.whole || both(def.half)),
    [0, -hz - 0.5, hx * 2 + 2, 1, 5, 'perimeter'], [0, hz + 0.5, hx * 2 + 2, 1, 5, 'perimeter'],
    [-hx - 0.5, 0, 1, hz * 2, 5, 'perimeter'], [hx + 0.5, 0, 1, hz * 2, 5, 'perimeter'],
  ];
  const toBox = ([x, z, sx, sz, h, kind, y0 = 0]) => ({
    min: [x - sx / 2, y0, z - sz / 2],
    max: [x + sx / 2, y0 + h, z + sz / 2],
    kind,
  });
  const boxes = raw.map(toBox), decor = (def.whole ? def.decor : both(def.decor || [])).map(toBox);   // decor: seen, but nothing collides with it
  const lights = (def.lights || []).flatMap(([x, y, z, c]) => [[x, y, z, c], [-x, y, -z, c]]);
  return {
    id, name: def.name, desc: def.desc, product: def.product, size: def.size, theme: def.theme, lights, boxes: def.whole ? boxGrid(boxes) : boxes, decor, whole: !!def.whole, air: !!def.air, focus: def.focus,
    spawns: { red: def.spawns, blue: def.blue || def.spawns.map(([x, z]) => [-x, -z]) },
    nav: buildNav(boxes, hx, hz),
  };
}

/* ---- bot navigation: a grid of open floor cells linked where a bot can walk straight between them ---- */
const CELL = 3;
const solid = (boxes, x, z, r) => !!findBox(boxes, x, z, r, b => b.min[1] < 1.75 && b.max[1] > 0.5 &&
  x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2]);

function clearWalk(boxes, x0, z0, x1, z1) {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4);
  for (let i = 1; i < n; i++) if (solid(boxes, x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, 0.42)) return false;
  return true;
}

export function buildNav(boxes, hx, hz) {
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
  const far = k => Math.hypot(points[k][0] - x, points[k][1] - z), around = main.filter(k => far(k) < 9);
  const near = (around.length ? around : [...main]).sort((a, b) => far(a) - far(b)).slice(0, 8);
  const start = near.find(k => clearWalk(map.boxes, x, z, points[k][0], points[k][1])) ?? near[0];
  // on a big land most walks end near the middle, so the teams meet
  const middle = map.focus && Math.random() < 0.65 ? main.filter(k => Math.hypot(...points[k]) < map.focus) : main;
  const goal = middle[Math.floor(Math.random() * middle.length)];
  const prev = new Map([[start, -1]]), queue = [start];
  for (let q = 0; q < queue.length && !prev.has(goal); q++) {
    const ks = links[queue[q]], o = Math.floor(Math.random() * ks.length);   // random order varies the routes
    for (let i = 0; i < ks.length; i++) { const k = ks[(i + o) % ks.length]; if (!prev.has(k)) { prev.set(k, queue[q]); queue.push(k); } }
  }
  const route = [];
  for (let k = goal; k !== -1 && k !== undefined; k = prev.get(k)) route.unshift(points[k]);
  return route;
}
