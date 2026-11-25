// Weapon tuning. slot 1 = primary, slot 2 = sidearm. rate = seconds between shots. spread values are radians.
// fall = [falloff start m, falloff end m, minimum damage multiplier]
// product = store id; weapons without one are free. Paid weapons play differently but must never beat the
// free Carbine's time to kill at any range (test/smoke.js checks this).
export const WEAPONS = {
  rifle: {
    name: 'Carbine', desc: 'Standard issue. Good at every range.', slot: 1, dmg: 26, head: 2, rate: 60 / 700, mag: 30, reserve: 150, reload: 2.2, auto: true,
    spread: { hip: 0.035, ads: 0.004, move: 0.045, bloom: 0.006, max: 0.06 },
    recoil: { v: 0.012, h: 0.006 }, fall: [35, 80, 0.7], range: 250, fov: 55,
  },
  sniper: {
    name: 'Marksman Rifle', desc: 'Scoped. One hit, then a long wait.', slot: 1, dmg: 100, head: 2, rate: 1.15, mag: 5, reserve: 25, reload: 3.0, auto: false,
    spread: { hip: 0.08, ads: 0.0008, move: 0.09, bloom: 0, max: 0.1 },
    recoil: { v: 0.07, h: 0.01 }, fall: [120, 250, 0.85], range: 300, fov: 16, scope: true, heavy: true,
  },
  smg: {
    name: 'Hornet SMG', desc: 'Very fast and steady on the move. Weak past 25 m.', product: 'weapon:smg',
    slot: 1, dmg: 18, head: 2, rate: 60 / 950, mag: 36, reserve: 180, reload: 1.8, auto: true,
    spread: { hip: 0.026, ads: 0.01, move: 0.018, bloom: 0.004, max: 0.05 },
    recoil: { v: 0.008, h: 0.006 }, fall: [12, 40, 0.5], range: 150, fov: 62,
  },
  shotgun: {
    name: 'Breaker Shotgun', desc: 'Nine pellets. Two close blasts finish a fight.', product: 'weapon:shotgun',
    slot: 1, dmg: 10, head: 1, rate: 0.85, mag: 6, reserve: 36, reload: 2.8, auto: false, pellets: 9, pelletSpread: 0.045,
    spread: { hip: 0.02, ads: 0.01, move: 0.02, bloom: 0, max: 0.04 },
    recoil: { v: 0.05, h: 0.012 }, fall: [8, 25, 0.25], range: 60, fov: 65, heavy: true,
  },
  dmr: {
    name: 'Longbow DMR', desc: 'Three careful shots, at any distance.', product: 'weapon:dmr',
    slot: 1, dmg: 45, head: 2, rate: 0.26, mag: 12, reserve: 60, reload: 2.5, auto: false,
    spread: { hip: 0.05, ads: 0.0015, move: 0.06, bloom: 0.012, max: 0.07 },
    recoil: { v: 0.03, h: 0.008 }, fall: [70, 160, 0.8], range: 300, fov: 34,
  },
  lmg: {
    name: 'Anvil LMG', desc: '80 rounds for holding a lane. Slow to reload.', product: 'weapon:lmg',
    slot: 1, dmg: 24, head: 1.75, rate: 60 / 620, mag: 80, reserve: 160, reload: 4.6, auto: true,
    spread: { hip: 0.06, ads: 0.007, move: 0.07, bloom: 0.003, max: 0.06 },
    recoil: { v: 0.011, h: 0.009 }, fall: [40, 90, 0.7], range: 250, fov: 55, heavy: true,
  },
  battle: {
    name: 'Ridgeback Battle Rifle', desc: 'Heavy rounds, slow and steady. Three hits.',
    slot: 1, dmg: 40, head: 2, rate: 60 / 350, mag: 20, reserve: 100, reload: 2.6, auto: true,
    spread: { hip: 0.05, ads: 0.003, move: 0.055, bloom: 0.011, max: 0.07 },
    recoil: { v: 0.022, h: 0.008 }, fall: [40, 85, 0.72], range: 280, fov: 48, heavy: true,
  },
  bullpup: {
    name: 'Kestrel Bullpup', desc: 'Short rifle that stays straight while you move.',
    slot: 1, dmg: 24, head: 2, rate: 60 / 620, mag: 25, reserve: 125, reload: 2.4, auto: true,
    spread: { hip: 0.028, ads: 0.005, move: 0.026, bloom: 0.005, max: 0.055 },
    recoil: { v: 0.01, h: 0.005 }, fall: [30, 70, 0.65], range: 220, fov: 55,
  },
  pistol: {
    name: 'Sidearm', desc: 'Quick and reliable.', slot: 2, dmg: 30, head: 2, rate: 60 / 380, mag: 12, reserve: 60, reload: 1.5, auto: false,
    spread: { hip: 0.03, ads: 0.008, move: 0.03, bloom: 0.01, max: 0.06 },
    recoil: { v: 0.025, h: 0.008 }, fall: [20, 50, 0.6], range: 120, fov: 65,
  },
  revolver: {
    name: 'Hammer Revolver', desc: 'Six very hard hits. Slow to reload.',
    slot: 2, dmg: 55, head: 1.8, rate: 0.48, mag: 6, reserve: 30, reload: 2.6, auto: false,
    spread: { hip: 0.035, ads: 0.005, move: 0.04, bloom: 0.02, max: 0.07 },
    recoil: { v: 0.05, h: 0.012 }, fall: [20, 50, 0.55], range: 120, fov: 62, heavy: true,
  },
  mpistol: {
    name: 'Wasp Machine Pistol', desc: 'Sprays 20 rounds up close.',
    slot: 2, dmg: 17, head: 1.8, rate: 60 / 850, mag: 20, reserve: 80, reload: 1.7, auto: true,
    spread: { hip: 0.04, ads: 0.016, move: 0.03, bloom: 0.006, max: 0.075 },
    recoil: { v: 0.012, h: 0.011 }, fall: [10, 30, 0.5], range: 90, fov: 66,
  },
};

// Carried next to the guns. n = uses per life. Thrown ones have a fuse in seconds.
export const EQUIP = {
  frag: { name: 'Frag grenade', desc: 'Two per life. Bounces, then explodes. Walls give cover.', n: 2, fuse: 2.2, thrown: true, radius: 7, full: 2, dmg: 110 },
  smoke: { name: 'Smoke grenade', desc: 'Two per life. Hides an area for 12 seconds, from bots too.', n: 2, fuse: 1.6, thrown: true, radius: 3.4, lasts: 12 },
  flash: { name: 'Flash bomb', desc: 'Two per life. Blinds enemies who can see it. Look away!', n: 2, fuse: 1.4, thrown: true, radius: 16, blind: 2.8 },
  fire: { name: 'Fire bomb', desc: 'One per life. Bursts where it lands and burns for 7 seconds.', n: 1, fuse: 4, thrown: true, impact: true, speed: 13, radius: 3, burns: 7, tick: 9 },
  charge: { name: 'Remote charge', desc: 'Two per life. Sticks where it lands. Press G again to blow it. Can be shot.', n: 2, fuse: 60, thrown: true, sticky: true, speed: 9, radius: 6, full: 1.8, dmg: 110 },
  med: { name: 'Med kit', desc: 'One per life. Restores 60 health over 2 seconds.', n: 1, heal: 60, over: 2 },
};

export const PRIMARIES = Object.keys(WEAPONS).filter(k => WEAPONS[k].slot === 1);
export const SIDEARMS = Object.keys(WEAPONS).filter(k => WEAPONS[k].slot === 2);
const inSlot = (w, n) => typeof w === 'string' && Object.hasOwn(WEAPONS, w) && WEAPONS[w].slot === n;
export const isPrimary = w => inSlot(w, 1);
export const isSidearm = w => inSlot(w, 2);
export const isEquip = e => typeof e === 'string' && Object.hasOwn(EQUIP, e);

// Damage of one bullet or pellet before rounding.
export function damageAt(W, dist, head) {
  const [f0, f1, fm] = W.fall;
  const k = dist > f0 ? Math.max(fm, 1 - (dist - f0) / (f1 - f0) * (1 - fm)) : 1;
  return W.dmg * (head ? W.head : 1) * k;
}
