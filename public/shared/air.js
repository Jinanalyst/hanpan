// Bombers and helicopters. A flight is a few numbers; where everything is at a given second follows from them, so the
// server (which decides what gets hit) and every browser see the same thing. dir is 1 or -1: flying toward +x or -x.

export const BOMBER = { name: 'Bombers', speed: 55, alt: 42, reach: 230, fall: 2.4, drift: 45, dmg: 120, radius: 7.5, full: 2.2, wings: [[0, 0], [-10, 12], [-10, -12]] };
export const HELI = { name: 'Helicopter', alt: 18, reach: 190, sweep: 27, enter: 5, stay: 17, dmg: 9, range: 85, hp: 320, rate: 0.1, burst: 13, rest: [1.1, 2] };
export const AIR_NAMES = { bomb: 'Air raid', heligun: 'Helicopter' };
const BOMB_LIFE = 2 * BOMBER.reach / BOMBER.speed + 0.6, HELI_LIFE = HELI.enter * 2 + HELI.stay;

export const flightLife = s => (s.k === 'bomb' ? BOMB_LIFE : s.down != null ? s.down + fallTime() : HELI_LIFE);

/* ---- bombers: three planes side by side ---- */
export const planeAt = (s, t, i) => { const [a, b] = BOMBER.wings[i]; return [s.dir * (BOMBER.speed * t - BOMBER.reach + a), BOMBER.alt, s.z + b]; };
// The bombs of a run over (cx, z): [x, y, z, plane, seconds until it leaves the plane]. ground(x, z) is the height of what it lands on.
export function bombRun(dir, cx, z, ground, jitter = () => 0) {
  const out = [];
  for (const [i, along] of [[0, -9], [1, -5], [2, -6], [0, 0], [1, 5], [2, 4], [0, 9]]) {
    const x = cx + dir * along + jitter(), bz = z + BOMBER.wings[i][1] * 0.75 + jitter();
    out.push([x, ground(x, bz), bz, i, (dir * x - BOMBER.drift + BOMBER.reach - BOMBER.wings[i][0]) / BOMBER.speed]);
  }
  return out;
}
export function bombAt(s, b, t) {
  const k = Math.max(0, Math.min(1, (t - b[4]) / BOMBER.fall));
  const z0 = s.z + BOMBER.wings[b[3]][1];
  return [b[0] - s.dir * BOMBER.drift * (1 - k), BOMBER.alt - 1 + (b[1] - BOMBER.alt + 1) * k * k, z0 + (b[2] - z0) * k];
}
export const bombLands = b => b[4] + BOMBER.fall;

/* ---- helicopter: flies in, sweeps across the land while firing, flies out ---- */
const FALL = 9;
export const fallTime = () => Math.sqrt(2 * HELI.alt / FALL);
export const heliFiring = t => t > HELI.enter * 0.8 && t < HELI.enter + HELI.stay;
export function heliAt(s, t) {
  const T = s.down != null ? Math.min(t, s.down) : t, { enter, stay, sweep, reach } = HELI;
  let a;
  if (T < enter) { const k = 1 - T / enter; a = -sweep - (reach - sweep) * k * k; }
  else if (T < enter + stay) { const k = (T - enter) / stay; a = -sweep + 2 * sweep * (k * k * (3 - 2 * k)); }
  else { const k = Math.min(1.2, (T - enter - stay) / enter); a = sweep + (reach - sweep) * k * k; }
  const p = [s.dir * a, HELI.alt + Math.sin(T * 0.9) * 0.8, s.z + Math.sin(T * 0.55) * 4];
  if (s.down != null && t > s.down) { const q = Math.min(t - s.down, fallTime()); p[0] += s.dir * q * 3; p[1] = Math.max(0.6, p[1] - FALL * q * q / 2); }
  return p;
}
