// Weapon tuning. rate = seconds between shots. spread values are radians.
// fall = [falloff start m, falloff end m, minimum damage multiplier]
export const WEAPONS = {
  rifle: {
    name: 'Carbine', slot: 1, dmg: 26, head: 2, rate: 60 / 700, mag: 30, reserve: 150, reload: 2.2, auto: true,
    spread: { hip: 0.035, ads: 0.004, move: 0.045, bloom: 0.006, max: 0.06 },
    recoil: { v: 0.012, h: 0.006 }, fall: [35, 80, 0.7], range: 250, fov: 55,
  },
  sniper: {
    name: 'Marksman Rifle', slot: 1, dmg: 100, head: 2, rate: 1.15, mag: 5, reserve: 25, reload: 3.0, auto: false,
    spread: { hip: 0.08, ads: 0.0008, move: 0.09, bloom: 0, max: 0.1 },
    recoil: { v: 0.07, h: 0.01 }, fall: [120, 250, 0.85], range: 300, fov: 16, scope: true,
  },
  pistol: {
    name: 'Sidearm', slot: 2, dmg: 30, head: 2, rate: 60 / 380, mag: 12, reserve: 60, reload: 1.5, auto: false,
    spread: { hip: 0.03, ads: 0.008, move: 0.03, bloom: 0.01, max: 0.06 },
    recoil: { v: 0.025, h: 0.008 }, fall: [20, 50, 0.6], range: 120, fov: 65,
  },
};
