// Weapon tuning. rate = seconds between shots. spread values are radians.
// fall = [falloff start m, falloff end m, minimum damage multiplier]
// product = store id; weapons without one are free. Paid weapons play differently but must never beat the
// free Carbine's time to kill at any range (test/smoke.js checks this).
export const WEAPONS = {
  rifle: {
    name: 'Carbine', slot: 1, dmg: 26, head: 2, rate: 60 / 700, mag: 30, reserve: 150, reload: 2.2, auto: true,
    spread: { hip: 0.035, ads: 0.004, move: 0.045, bloom: 0.006, max: 0.06 },
    recoil: { v: 0.012, h: 0.006 }, fall: [35, 80, 0.7], range: 250, fov: 55,
  },
  sniper: {
    name: 'Marksman Rifle', slot: 1, dmg: 100, head: 2, rate: 1.15, mag: 5, reserve: 25, reload: 3.0, auto: false,
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
  pistol: {
    name: 'Sidearm', slot: 2, dmg: 30, head: 2, rate: 60 / 380, mag: 12, reserve: 60, reload: 1.5, auto: false,
    spread: { hip: 0.03, ads: 0.008, move: 0.03, bloom: 0.01, max: 0.06 },
    recoil: { v: 0.025, h: 0.008 }, fall: [20, 50, 0.6], range: 120, fov: 65,
  },
};

export const PRIMARIES = Object.keys(WEAPONS).filter(k => WEAPONS[k].slot === 1);
export const isPrimary = w => typeof w === 'string' && Object.hasOwn(WEAPONS, w) && WEAPONS[w].slot === 1;

// Damage of one bullet or pellet before rounding.
export function damageAt(W, dist, head) {
  const [f0, f1, fm] = W.fall;
  const k = dist > f0 ? Math.max(fm, 1 - (dist - f0) / (f1 - f0) * (1 - fm)) : 1;
  return W.dmg * (head ? W.head : 1) * k;
}
