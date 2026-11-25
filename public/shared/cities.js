// City lands. Same rules as map.js: half of the boxes, the other half is mirrored, so both teams get the same streets.
// decor is drawn but has no collision. Building kinds start with "f" (facade) and get shop fronts at street level.
// theme.ring: building kinds that surround the land; theme.landmark: [shape, x, z] far behind them.
import { stairs, stall, pavilion, spawnLine, car, bus, lamp, hanok, subway, zebra, lane, walk } from './landkit.js';

const YELLOW = 'f2b91f', WHITE = 'e8e9ea', BLACK = '1f2226', RED = 'b3261e', BLUE = '2c5f9e', SILVER = '9aa3ab', ORANGE = 'd9701c', GREEN = '3f7d3a';

export const CITIES = {
  tokyo: {
    name: 'Tokyo Crossing', desc: 'Neon rain over a giant crossing', size: [36, 42],
    spawns: spawnLine(-39, [-20, -13, -6, 0, 6, 13, 20]),
    half: [
      [-20, -18, 14, 12, 12, 'fNeon'], [19, -19, 12, 14, 14, 'fNeon'], [-31.5, -3, 9, 12, 10, 'fNeon'],
      // police box on the island
      [0, 0, 3, 3, 3.2, 'panel'], [0, 0, 3.8, 3.8, 0.3, 'metal', 3.2],
      // railway viaduct
      [0, -31, 72, 4.4, 0.8, 'wall', 5.4], [-30, -31, 1.4, 1.4, 5.4, 'wall'], [-17, -31, 1.4, 1.4, 5.4, 'wall'], [-5, -31, 1.4, 1.4, 5.4, 'wall'], [8, -31, 1.4, 1.4, 5.4, 'wall'], [19, -31, 1.4, 1.4, 5.4, 'wall'], [30, -31, 1.4, 1.4, 5.4, 'wall'],
      // traffic
      ...car(-6, -15, YELLOW), ...car(5, -11, WHITE), ...car(-9, -4.5, BLACK, true), ...bus(9.5, -20, GREEN), ...car(30, -9, SILVER), ...car(-3, -23, RED), ...car(18, -6, WHITE, true),
      // street
      [-8, -27.5, 4, 0.5, 2.8, 'panel'], [3.5, -27, 4, 0.5, 2.8, 'panel'],
      [-12.4, -20, 0.9, 2.6, 1.9, 'vend'], [12.4, -14, 0.9, 2.6, 1.9, 'vend'], [-30, -23, 2.4, 0.9, 1.9, 'vend'], ...stall(30, -20), ...stall(-31, -15),
      [-15, -9.5, 1.2, 1.2, 1.2, 'crate'], [33, -27, 1.2, 1.2, 1.2, 'crate'], [-22, -27, 2.4, 1.2, 1.2, 'crate'], [2, -18, 0.8, 0.8, 1.1, 'barrel'],
      ...lamp(-10.5, -11), ...lamp(11, -27),
      [-6, -35.5, 4, 0.8, 1.3, 'barrier'], [6, -35.5, 4, 0.8, 1.3, 'barrier'], [-18, -35.5, 4, 0.8, 1.3, 'barrier'], [18, -35.5, 4, 0.8, 1.3, 'barrier'],
      [-12, 0, 0.7, 0.7, 5, 'blossom'], [-12.2, -25.5, 0.7, 0.7, 5, 'blossom'],
    ],
    decor: [
      walk(-20, -18, 14, 12), walk(19, -19, 12, 14), [-30, -3, 8, 15, 0.025, 'paving'],
      ...zebra(0, -9, 18, 4), ...zebra(-9, 0, 4, 12, true), [0, 0, 5, 5, 0.03, 'paving'], ...lane(0, -30, -12),
      [6, -31, 34, 2.6, 2.7, 'bus-d8dde2', 6.2],
      // signs
      [-12.8, -15, 0.4, 1.3, 6, 'neonM', 4], [-12.8, -18.5, 0.4, 1.3, 4.5, 'neonC', 5.5], [-12.8, -22, 0.4, 1.3, 6, 'neonY', 4], [-20, -11.8, 8, 0.3, 3, 'screenA', 5],
      [12.8, -16, 0.4, 1.3, 6, 'neonC', 4.2], [12.8, -20, 0.4, 1.3, 5, 'neonM', 5], [12.8, -24, 0.4, 1.3, 6, 'neonY', 4], [19, -11.8, 8, 0.3, 4, 'screenB', 5.5],
      [-26.8, -3, 0.3, 7, 3, 'screenA', 4.5], [-26.7, -7.8, 0.5, 1.2, 5, 'neonM', 4], [0, -33.3, 10, 0.1, 0.5, 'neonC', 5.5],
    ],
    lights: [[-11, 4, -18, 0xff4fa8], [11, 4, -18, 0x3fd8ff], [-23, 4, -3, 0xffd24a], [0, 5, -6, 0xbfd8ff]],
    theme: {
      skyTop: 0x0a0d2a, skyHor: 0x4a2f66, fog: [0x2d2750, 50, 210], hemi: [0xbcc4f4, 0x6a6486, 2.5], sun: [0xc2ccff, 1.8, [28, 55, -26]],
      ground: ['#3d4048', '#363940', '#464952', '#2f3238', '#4c505a'], perimeter: 0x55526a, wall: 0xa7a8b8, far: ['city', 0x2a2840], ring: ['fNeon'], night: true,
      landmark: ['lattice', 108, 40], particles: { color: 0xa9c4ff, fall: 15, size: 0.05 }, vm: 0.9,
    },
  },

  seoul: {
    name: 'Seoul Gate', desc: 'An old gate between glass towers', size: [38, 42],
    spawns: spawnLine(-39, [-20, -13, -6, 0, 6, 13, 20]),
    half: [
      // city gate
      [-8.5, 0, 3, 5, 4.2, 'stone'], [-3, 0, 2, 5, 4.2, 'stone'], [0, 0, 21, 6, 0.6, 'stone', 4.2], [0, 0, 15, 3.6, 2.4, 'redwood', 4.8], [0, 0, 20, 7, 0.45, 'tile', 7.2], [0, 0, 15, 4.8, 0.5, 'tile', 7.65], [0, 0, 9, 2.4, 0.5, 'tile', 8.15],
      [-14.5, 0, 9, 1.2, 2.6, 'stone'], [-14.5, 0, 9.2, 1.7, 0.3, 'tile', 2.6],
      // blocks
      [-26, -18, 14, 14, 16, 'fGlass'], [22, -17, 12, 12, 11, 'fSeoul'], [33.5, -24, 9, 8, 9, 'fSeoul'],
      ...hanok(6, -19, 7, 5), ...hanok(-9, -14, 6, 5), ...hanok(32, -2, 7, 6),
      // stream banks
      [-15, -27, 8, 0.7, 1, 'stone'], [4, -27, 8, 0.7, 1, 'stone'], [21, -27, 8, 0.7, 1, 'stone'], [-30, -31, 8, 0.7, 1, 'stone'], [-6, -31, 8, 0.7, 1, 'stone'], [14, -31, 8, 0.7, 1, 'stone'],
      // traffic
      ...bus(-15, -6.5, BLUE, true), ...car(10, -9, ORANGE), ...car(1, -9.5, WHITE, true), ...car(-14, -20, SILVER), ...bus(13, -24.2, GREEN, true), ...car(-34, -9, BLACK), ...car(18, -6, WHITE, true),
      // street
      ...stall(-3, -24), ...stall(24, -8), ...stall(-34, -24.5), [-20, -3.5, 1.2, 1.2, 1.2, 'crate'], [0, -14, 1.4, 1.4, 1.3, 'stone'], [29, -12, 1.2, 1.2, 1.2, 'crate'], [-5.2, -5, 0.8, 0.8, 1.3, 'stone'], [5.2, -6, 0.8, 0.8, 1.3, 'stone'],
      [-17.5, -10, 0.7, 0.7, 5, 'tree'], [14, -13, 0.7, 0.7, 5, 'blossom'], [-35, -15, 0.7, 0.7, 5, 'tree'], [35, -11, 0.7, 0.7, 5, 'tree'], [-21, -29, 0.7, 0.7, 5, 'blossom'], ...lamp(-2, -20), ...lamp(27, -31),
      [-6, -36, 4, 0.8, 1.3, 'barrier'], [6, -36, 4, 0.8, 1.3, 'barrier'], [-18, -36, 4, 0.8, 1.3, 'barrier'], [18, -36, 4, 0.8, 1.3, 'barrier'],
    ],
    decor: [
      [0, -29, 76, 3.3, 0.03, 'water'], [0, -29, 5, 3.6, 0.06, 'paving'], [-24, -29, 4, 3.6, 0.06, 'paving'], [28, -29, 4, 3.6, 0.06, 'paving'],
      walk(-26, -18, 14, 14), walk(22, -17, 12, 12), [0, 0, 24, 10, 0.03, 'paving'], ...zebra(0, -11.8, 14, 3), ...lane(-1.5, -27, -14),
      [15.8, -13, 0.4, 1.2, 6, 'neonM', 4], [15.8, -16, 0.4, 1.2, 5, 'neonY', 4.5], [15.8, -19, 0.4, 1.2, 6, 'neonC', 4], [22, -10.8, 7, 0.3, 2.6, 'screenB', 5], [28.8, -24, 0.4, 1.2, 5, 'neonM', 3.6], [-18.8, -18, 0.3, 8, 4, 'screenA', 7],
    ],
    lights: [[13.5, 4, -16, 0xff5f9a], [0, 3, -4, 0xffb866], [-16, 5, -16, 0x6fb8ff], [22, 4, -8.5, 0xffd24a]],
    theme: {
      skyTop: 0x27356f, skyHor: 0xf0a27c, fog: [0xa7839a, 60, 240], hemi: [0xe2cfe6, 0x5e5870, 1.8], sun: [0xffb98a, 2.3, [-45, 34, 24]],
      ground: ['#5c5e64', '#525459', '#66686e', '#484a50', '#6f7177'], perimeter: 0xa8a2ac, wall: 0xcac6cc, far: ['city', 0x5d5670], ring: ['fSeoul', 'fGlass'], night: true,
      landmark: ['hilltower', 112, -30], vm: 0.95,
    },
  },

  newyork: {
    name: 'New York Square', desc: 'Yellow cabs under bright billboards', size: [38, 42],
    spawns: spawnLine(-39, [-20, -13, -6, 0, 6, 13, 20]),
    half: [
      [-24, -20, 16, 14, 17, 'fBrick'], [24, -20, 16, 14, 20, 'fStone'], [-33, -3, 10, 10, 13, 'fBrick'],
      [0, -22, 9, 8, 13, 'fStone'],
      // red steps in the middle of the square
      [0, 0, 8, 3, 2.1, 'redstep'], ...stairs(0, -1.5, 0, -1, 8, 2.1, 'redstep'), [-2.6, 0.9, 1.4, 0.4, 0.9, 'metal', 2.1],
      // traffic
      ...car(-9, -10, YELLOW), ...car(9, -15, YELLOW), ...car(-10, -24, YELLOW), ...car(13, -5, YELLOW, true), ...bus(11.5, -26, WHITE), ...car(-14, -3, BLACK), ...car(-20, -6, SILVER, true), ...car(-34, -13, BLUE), ...car(30, -8.5, YELLOW, true),
      // scaffold, cart, subway, bins
      ...pavilion(-25, -10.9, 9, 2.8, 0, 3, 'metal', 'wood'), ...stall(6.5, -10), ...stall(-12.5, -15), ...subway(19, -9.5), ...subway(-7, -17),
      [35, -22, 2, 3.5, 1.4, 'dump'], [-35, -22, 2, 3.5, 1.4, 'dump'], [35, -14, 1.2, 1.2, 1.2, 'crate'], [-5.8, -28, 0.9, 0.9, 1.3, 'car-' + BLUE], [4.5, -5.5, 0.8, 0.8, 1.1, 'barrel'], [-27, 4.5, 2, 3, 1.4, 'dump'],
      [8, -31, 2.2, 1, 2.6, 'panel'], [-20, -30, 6, 1, 1.05, 'hedge'], [22, -30, 6, 1, 1.05, 'hedge'],
      [-15, -11.5, 0.6, 0.6, 5, 'tree'], [15, -11, 0.6, 0.6, 5, 'tree'], [-15, -29, 0.6, 0.6, 5, 'tree'], ...lamp(5.5, -17.3), ...lamp(-15.3, -21),
      [-6, -35, 4, 0.8, 1.3, 'barrier'], [6, -35, 4, 0.8, 1.3, 'barrier'], [-17, -35, 4, 0.8, 1.3, 'barrier'], [17, -35, 4, 0.8, 1.3, 'barrier'],
    ],
    decor: [
      walk(-24, -20, 16, 14), walk(24, -20, 16, 14), walk(0, -22, 9, 8), [-31.5, -3, 9, 13, 0.025, 'paving'], [0, 0, 11, 13, 0.03, 'paving'],
      ...zebra(-10, -13.5, 7, 3), ...zebra(10, -11, 7, 3), ...lane(-10.5, -34, -15), ...lane(10.5, -34, -13),
      [0, -17.8, 7.5, 0.3, 5, 'screenA', 4.5], [0, -26.2, 7.5, 0.3, 5, 'screenB', 4.5], [-4.7, -22, 0.3, 6, 4, 'screenB', 4.5], [4.7, -22, 0.3, 6, 4, 'screenA', 4.5],
      [-15.8, -17, 0.3, 6, 4.5, 'screenA', 6], [15.8, -22, 0.3, 7, 5, 'screenB', 6], [15.7, -15.5, 0.4, 1.2, 6, 'neonM', 4], [-15.7, -23, 0.4, 1.2, 5, 'neonY', 4], [-27.8, -3, 0.3, 6, 4, 'screenB', 5], [-1.5, -23.9, 0.6, 0.3, 1.2, 'neonC', 2.4],
    ],
    theme: {
      skyTop: 0x3f7cc4, skyHor: 0xd5e4ee, fog: [0xc3d0da, 75, 270], hemi: [0xe4edf6, 0x5f5c58, 1.45], sun: [0xfff1d6, 2.6, [30, 62, -18]],
      ground: ['#55575a', '#4b4d50', '#5f6164', '#424447', '#686a6d'], perimeter: 0xb7a79a, wall: 0xc9c5be, far: ['city', 0x8892a0], ring: ['fBrick', 'fStone', 'fGlass'],
      landmark: ['deco', 110, 34], vm: 1,
    },
  },

  paris: {
    name: 'Paris Boulevard', desc: 'Cafes and trees around a fountain', size: [38, 40],
    spawns: spawnLine(-37, [-20, -13, -6, 0, 6, 13, 20]),
    half: [
      [-25, -19, 14, 12, 10, 'fParis'], [24, -18, 14, 12, 10, 'fParis'], [-32, -2, 12, 10, 10, 'fParis'],
      [-25, -19, 13, 11, 1.8, 'slate', 10], [24, -18, 13, 11, 1.8, 'slate', 10], [-32, -2, 11, 9, 1.8, 'slate', 10],
      // fountain
      [0, 0, 8, 8, 0.9, 'stone'], [0, 0, 7, 7, 0.12, 'water', 0.9], [0, 0, 2.6, 2.6, 1, 'stone', 0.9], [0, 0, 0.9, 0.9, 2.2, 'stone', 1.9],
      // arch over the boulevard
      [-4.6, -21, 3, 3.6, 6, 'limestone'], [4.6, -21, 3, 3.6, 6, 'limestone'], [0, -21, 12.4, 3.6, 2.4, 'limestone', 6], [0, -21, 13.2, 4.4, 0.5, 'limestone', 8.4],
      // cafes and kiosks
      ...stall(-15.5, -9.5), ...stall(20, -9.5), ...stall(-23, -10.5), ...stall(13.5, -14.5), [9, -11.5, 1.8, 1.8, 2.8, 'kiosk'], [9, -11.5, 2.4, 2.4, 0.4, 'slate', 2.8], [-11, -29, 1.8, 1.8, 2.8, 'kiosk'], [-11, -29, 2.4, 2.4, 0.4, 'slate', 2.8],
      // hedges, beds
      [-7, -10, 6, 1, 1.05, 'hedge'], [3, -13, 5, 1, 1.05, 'hedge'], [8, -27, 6, 1, 1.05, 'hedge'], [-9, -5, 1, 4, 1.05, 'hedge'], [22, -29, 6, 1, 1.05, 'hedge'], [-24, -29, 6, 1, 1.05, 'hedge'],
      ...car(-13, -17, WHITE), ...car(14, -22, BLUE), ...car(-35, -15, RED), ...car(20, -4.5, BLACK, true), ...car(34, -13, SILVER),
      // trees in rows
      [-11, -13, 0.7, 0.7, 5.5, 'tree'], [11.5, -18, 0.7, 0.7, 5.5, 'tree'], [-11, -23, 0.7, 0.7, 5.5, 'tree'], [11.5, -26.5, 0.7, 0.7, 5.5, 'tree'], [-15, -5, 0.7, 0.7, 5.5, 'tree'], [12, -6, 0.7, 0.7, 5.5, 'tree'], [34, -22, 0.7, 0.7, 5.5, 'tree'], [-35, -24, 0.7, 0.7, 5.5, 'tree'],
      ...lamp(-7.5, -16), ...lamp(7.5, -16), ...lamp(0, -30), [-34, -10, 1.2, 1.2, 1.2, 'crate'], [0, -17, 1.2, 1.2, 1.2, 'crate'],
      [-5, -32, 4, 0.8, 1.3, 'stone'], [5, -32, 4, 0.8, 1.3, 'stone'], [-17, -33, 4, 0.8, 1.3, 'stone'], [17, -33, 4, 0.8, 1.3, 'stone'],
    ],
    decor: [walk(-25, -19, 14, 12), walk(24, -18, 14, 12), [-31, -2, 12, 13, 0.025, 'paving'], [0, 0, 16, 16, 0.03, 'paving'], ...zebra(0, -24.6, 6, 3), ...lane(0, -20, -9)],
    theme: {
      skyTop: 0x6b9fd6, skyHor: 0xf5e3c4, fog: [0xe2d6c2, 70, 250], hemi: [0xfff3df, 0x6d6656, 1.4], sun: [0xffe0ae, 2.8, [-38, 44, -20]],
      ground: ['#8d887e', '#827d73', '#989388', '#767167', '#a39e92'], perimeter: 0xd8cdb6, wall: 0xe3dac6, far: ['city', 0xb0a793], ring: ['fParis'],
      landmark: ['iron', 100, 36], vm: 1,
    },
  },

  london: {
    name: 'London Row', desc: 'Brick terraces and red buses in the fog', size: [36, 42],
    spawns: spawnLine(-39, [-20, -13, -6, 0, 6, 13, 20]),
    half: [
      [-21, -20, 16, 10, 9, 'fTerrace'], [21, -22, 14, 10, 9, 'fTerrace'], [-12.5, -5, 5, 9, 8, 'fTerrace'], [31, -9, 10, 8, 9, 'fTerrace'],
      [-21, -20, 15, 4, 1.6, 'slate', 9], [21, -22, 13, 4, 1.6, 'slate', 9], [31, -9, 9, 4, 1.6, 'slate', 9], [-26, -20, 1, 1.4, 3, 'brick', 9], [17, -22, 1, 1.4, 3, 'brick', 9],
      // covered market
      [-6, -3.4, 0.5, 0.5, 3.8, 'metal'], [6, -3.4, 0.5, 0.5, 3.8, 'metal'], [0, -3.4, 0.5, 0.5, 3.8, 'metal'], [0, 0, 14, 9, 0.3, 'carglass', 3.8], [0, 0, 9, 4, 0.6, 'metal', 4.1],
      [-3.4, -1.6, 2.6, 0.9, 1.1, 'wood'], [3.2, -2.4, 1.2, 1.2, 1.2, 'crate'], [0, 0, 1.2, 1.2, 1.2, 'crate'],
      // traffic
      ...bus(3.5, -16, RED, false, 4.3), ...car(-6, -13.5, BLACK), ...car(-2.5, -26, BLACK, true), ...bus(-27, -10, RED, true, 4.3), ...car(18, -13, SILVER, true), ...car(31, -19, BLACK), ...car(-8, -29, GREEN),
      // phone boxes, column, railings
      [-9.5, -18, 1, 1, 2.5, 'phone'], [11.5, -16, 1, 1, 2.5, 'phone'], [11.5, -19, 1, 1, 2.5, 'phone'], [-30, -28, 1, 1, 2.5, 'phone'],
      [8, -28, 2.4, 2.4, 1.1, 'limestone'], [8, -28, 0.9, 0.9, 5, 'limestone', 1.1], [8, -28, 1.3, 1.3, 0.4, 'limestone', 6.1],
      [-17, -11.5, 5, 0.4, 1.1, 'metal'], [19, -8, 0.4, 5, 1.1, 'metal'], [-33, -17, 3, 0.4, 1.1, 'metal'], ...stall(-19, -28), ...stall(20, -30), [-3, -22.5, 4.5, 0.5, 2.8, 'panel'], [9.5, -12.5, 0.5, 3.5, 2.8, 'panel'],
      [9.5, -8.5, 5, 1, 1.05, 'hedge'], [-21, -3, 1, 5, 1.05, 'hedge'], [0, -20.5, 1.2, 1.2, 1.2, 'crate'], [33, -27, 1.2, 1.2, 1.2, 'crate'],
      [-11, -24, 0.7, 0.7, 6, 'tree'], [13, -6, 0.7, 0.7, 6, 'tree'], [-32, -5, 0.7, 0.7, 6, 'tree'], [24, -4, 0.7, 0.7, 6, 'tree'], ...lamp(-9.5, -12), ...lamp(9, -22),
      [-5, -35, 4, 0.8, 1.3, 'barrier'], [5, -35, 4, 0.8, 1.3, 'barrier'], [-17, -35, 4, 0.8, 1.3, 'barrier'], [17, -35, 4, 0.8, 1.3, 'barrier'],
    ],
    decor: [walk(-21, -20, 16, 10), walk(21, -22, 14, 10), walk(-12.5, -5, 5, 9), [31, -9, 12, 12, 0.025, 'paving'], [0, 0, 17, 12, 0.03, 'paving'], ...zebra(0, -9.5, 8, 3), ...lane(0, -34, -13)],
    theme: {
      skyTop: 0x8b98a6, skyHor: 0xd3d8da, fog: [0xb9c1c6, 30, 165], hemi: [0xe6ecf0, 0x66645f, 1.6], sun: [0xf2f3ee, 1.5, [26, 55, 22]],
      ground: ['#5f6164', '#54565a', '#6a6c70', '#4a4c50', '#737579'], perimeter: 0xa28878, wall: 0xc3bdb4, far: ['city', 0x8a8f94], ring: ['fTerrace'],
      landmark: ['clock', 84, 30], particles: { color: 0xc9d4dc, fall: 12, size: 0.04 }, vm: 1,
    },
  },

  dubai: {
    name: 'Dubai Marina', desc: 'Palms, pools and towers in the heat', size: [40, 40],
    spawns: spawnLine(-37, [-20, -13, -6, 0, 6, 13, 20]),
    half: [
      [-24, -20, 12, 12, 20, 'fSand'], [22, -21, 10, 14, 24, 'fGlass'], [-35, -4, 10, 8, 12, 'fSand'],
      // pool
      [0, 0, 1.8, 1.8, 2.4, 'limestone'], [-4, -6.6, 5, 0.9, 1.05, 'limestone'], [4.6, -6.6, 3.4, 0.9, 1.05, 'limestone'], [-6.6, -2, 0.9, 5, 1.05, 'limestone'],
      // old market arcade and wind tower
      ...pavilion(-10, -15, 8, 5, 0, 3.3, 'limestone', 'sandw'), [-10, -15, 3, 1, 1.1, 'wood'], [9, -14, 3, 3, 8, 'sandw'], [9, -14, 3.5, 3.5, 0.5, 'limestone', 8],
      [-20, -9, 8, 0.7, 2.6, 'sandw'], [14, -8.6, 0.7, 6, 2.6, 'sandw'], [-6, -21.5, 6, 0.7, 2.8, 'sandw'], [7.5, -22.5, 5, 0.7, 2.8, 'sandw'], [30, -11, 7, 0.7, 2.6, 'sandw'],
      ...stall(2, -20), ...stall(-33, -13), ...stall(31, -27),
      // traffic
      ...car(-4, -27, WHITE, true), ...car(13, -24, RED), ...car(-14.5, -23, BLACK), ...car(33, -19, YELLOW), ...car(22, -5, SILVER, true), ...car(-25, -3, WHITE, true), ...car(3, -11.5, BLACK, true),
      // planters
      [-13, -5, 1.2, 4, 1, 'limestone'], [8, -29, 5, 1.2, 1, 'limestone'], [-18, -29, 5, 1.2, 1, 'limestone'], [-34, -22, 1.2, 4, 1, 'limestone'], [28, -32, 4, 1.2, 1, 'limestone'],
      [-30, -12, 1.2, 1.2, 1.2, 'crate'], [17, -11, 1.2, 1.2, 1.2, 'crate'], [0, -24, 1.2, 1.2, 1.2, 'crate'],
      [-8, -9.5, 0.5, 0.5, 6, 'palm'], [8, -9.8, 0.5, 0.5, 6, 'palm'], [-15.5, -27, 0.5, 0.5, 6.5, 'palm'], [14.5, -29, 0.5, 0.5, 6, 'palm'], [-11, -2, 0.5, 0.5, 6, 'palm'], [34, -7, 0.5, 0.5, 6.5, 'palm'], [-36, -27, 0.5, 0.5, 6, 'palm'], [5, -33, 0.5, 0.5, 6, 'palm'], [-28, -9.5, 0.5, 0.5, 6, 'palm'], [29.5, -15, 0.5, 0.5, 6, 'palm'],
      [-6, -33.5, 4, 0.8, 1.3, 'barrier'], [12, -33.5, 4, 0.8, 1.3, 'barrier'], [-20, -33.5, 4, 0.8, 1.3, 'barrier'],
    ],
    decor: [[0, 0, 12.4, 12.4, 0.03, 'water'], [0, 0, 16.5, 16.5, 0.02, 'paving'], walk(-24, -20, 12, 12), walk(22, -21, 10, 14), [-34, -4, 12, 11, 0.025, 'paving'], ...lane(5.5, -36, -16)],
    theme: {
      skyTop: 0x3f8fd0, skyHor: 0xf4e6c8, fog: [0xe7d9bd, 70, 260], hemi: [0xfff4dc, 0x8a7550, 1.4], sun: [0xfff0cc, 3.0, [24, 66, 20]],
      ground: ['#b9a88a', '#ad9c7e', '#c5b496', '#a08f72', '#cfc0a4'], perimeter: 0xdccbaa, wall: 0xe8dcc4, far: ['city', 0xc3b79e], ring: ['fSand', 'fGlass'],
      landmark: ['needle', 112, 30], vm: 1,
    },
  },
};
