// Authoritative match logic. Isomorphic: the Node server runs it for online play,
// the browser runs the same code for offline practice.
import { getMap, randomRoute, groundAt } from './map.js';
import { PHYS, NADE_DT, step, stepNade, nadeStart, stanceH, stanceEye, fitStance, leanOff, eyeOf, wallAt, peekRoom, rayMap, rayBox, dirFrom, hits, hitbox } from './physics.js';
import { WEAPONS, EQUIP, SIDEARMS, isPrimary, isSidearm, isEquip, damageAt } from './weapons.js';
import { BOMBER, HELI, flightLife, bombRun, bombLands, heliAt, heliFiring } from './air.js';
import { packGear, unpackGear, randomGear } from './gear.js';
import { PACKET } from './adpcm.js';

export const MATCH_TIME = 600;   // seconds
export const KILL_LIMIT = 15;
const FIGHT_COUNT = 5;            // seconds between a full private fight and the start
export const RESPAWN = 4;
export const PROTECT = 2;        // spawn protection seconds
const SNAP_RATE = 1 / 20;
const BOT_NAMES = ['Viper', 'Ghost', 'Falcon', 'Bishop', 'Kilo', 'Raven', 'Hawk', 'Nomad', 'Sierra', 'Tango', 'Jackal', 'Wolf'];

const now = () => performance.now() / 1000;
const rnd = (a, b) => a + Math.random() * (b - a);
const r2 = v => Math.round(v * 100) / 100;
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
export const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} _\-]/gu, '').trim().slice(0, 16) || 'Soldier';

// Chat text: one line, no control or direction-flipping characters, at most 120 characters.
export const cleanChat = s => typeof s !== 'string' ? '' : [...s.replace(/[\p{Cc}\u200b\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/gu, ' ').replace(/\s+/g, ' ').trim()].slice(0, 120).join('');
const CHAT_BURST = 4, CHAT_EVERY = 1.5;   // messages at once, then seconds per message
const VOICE_PER_SEC = 25;                 // packets of 40 ms
// Medkits that fall onto the land now and then. Whoever walks over one first gets the health.
export const DROP = { max: 3, every: [10, 18], fall: 1.5, life: 45, heal: 50, reach: 1.2 };

export class Room {
  constructor(o = {}) {
    this.id = o.id || 'local';
    this.map = getMap(o.map);
    this.minPlayers = o.minPlayers ?? 6;   // bots fill up to this many players
    this.maxPlayers = o.maxPlayers ?? 12;
    this.killLimit = o.killLimit ?? KILL_LIMIT;
    this.matchTime = o.matchTime ?? MATCH_TIME;
    this.players = new Map();
    this.seq = 1;
    this.botSeq = 0;
    this.score = { red: 0, blue: 0 };
    this.phase = 'play';
    this.timeLeft = this.matchTime;
    this.endT = 0;
    this.snapAcc = 0;
    this.pingAcc = 0;
    this.nadeSeq = 1;
    this.nades = [];    // grenades in the air
    this.smokes = [];   // { x, y, z, until }
    this.fires = [];    // { x, y, z, until, by, team, next }
    this.airSeq = 1;
    this.clearAir();
    this.clearDrops();
    // A private fight (fight = players per team): no bots, and the match starts once both teams are full.
    this.fight = o.fight || 0;
    if (this.fight) { this.minPlayers = 0; this.maxPlayers = this.fight * 2; this.phase = 'wait'; this.goT = 0; }
  }

  humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }
  botCount() { return this.players.size - this.humanCount(); }
  teamSize(t) { let n = 0; for (const p of this.players.values()) if (p.team === t) n++; return n; }

  // owned: Set of bought product ids, or 'all' (bots and offline practice)
  canUse(p, w) { const id = WEAPONS[w].product; return !id || p.owned === 'all' || p.owned.has(id); }
  pickPrimary(p, lo) { return isPrimary(lo) && this.canUse(p, lo) ? lo : 'rifle'; }

  // What the player carries from the next spawn on. Anything invalid or not owned becomes the standard issue.
  setLoadout(p, l) {
    p.want = { lo: this.pickPrimary(p, l.lo), sa: isSidearm(l.sa) && this.canUse(p, l.sa) ? l.sa : 'pistol', eq: isEquip(l.eq) ? l.eq : 'frag' };
  }

  // kit: { sa, eq, gear } = sidearm, equipment and outfit code
  newPlayer(name, lo, bot, send, owned = new Set(), kit = {}) {
    const id = this.seq++;
    const team = this.teamSize('red') <= this.teamSize('blue') ? 'red' : 'blue';
    const p = {
      id, name: bot ? name : cleanName(name), team, bot, send: send || (() => {}), owned: bot ? 'all' : owned,
      lo: 'rifle', sa: 'pistol', eq: 'frag', eqN: 0, eqNext: 0, healT: 0, want: null, gear: packGear(unpackGear(kit.gear)), k: 0, d: 0,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ground: true, cr: 0, crT: 0, wl: 0, pk: 0, yaw: 0, pitch: 0,
      hp: 100, alive: false, rsT: 0, prot: 0, w: '', mag: {}, res: {}, rlT: 0, next: 0,
      hist: [], ping: 0, sp: 0, lastIn: 0,
      sendBin: null, chatN: CHAT_BURST, chatAt: now(), voiceN: VOICE_PER_SEC, voiceAt: now(),
      ai: bot ? { route: [], scan: 0, target: 0, hurtBy: 0, react: 0, strafe: 1, strafeT: 0, stuckT: 0, sx: 0, sz: 0, err: rnd(0.02, 0.05), kneel: false, blind: 0, bombT: rnd(6, 16) } : null,
    };
    this.setLoadout(p, { lo, sa: kit.sa, eq: kit.eq });
    this.players.set(id, p);
    return p;
  }

  addPlayer(name, lo, send, owned, sendBin, kit) {
    const p = this.newPlayer(name, lo, false, send, owned, kit);
    p.sendBin = sendBin || null;
    this.spawn(p);
    p.send({ t: 'welcome', id: p.id, team: p.team, room: this.id, map: this.map.id, lo: p.lo, limit: this.killLimit });
    const t = now();
    for (const [w, list] of [['smoke', this.smokes], ['fire', this.fires]]) for (const s of list) if (s.until > t) p.send({ t: 'gx', id: 0, w, p: [s.x, s.y, s.z].map(r2), d: r2(s.until - t) });
    for (const n of this.nades) if (n.stuck) p.send({ t: 'gt', id: n.id, w: n.w, by: n.by, tm: n.team, o: [n.x, n.y, n.z].map(r2), v: [0, 0, 0], st: 1 });
    for (const s of this.flights) p.send(this.flightMsg(s, t));
    for (const d of this.drops) p.send(this.dropMsg(d, t));
    this.balanceBots();
    this.roster();
    this.lobby();
    return p.id;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!this.players.delete(id)) return;
    for (const n of [...this.nades]) if (n.by === id) { this.dropNade(n); this.broadcast({ t: 'gx', id: n.id, w: 'fizz', p: [n.x, n.y, n.z].map(r2) }); }
    this.balanceBots();
    this.roster();
    // In a private fight a team that has nobody left loses.
    if (this.fight && this.phase === 'play' && this.players.size && !this.teamSize(p.team)) this.endMatch(p.team === 'red' ? 'blue' : 'red');
    this.lobby();
  }

  balanceBots() {
    const humans = this.humanCount();
    const want = humans ? Math.max(0, this.minPlayers - humans) : 0;
    let bots = [...this.players.values()].filter(p => p.bot);
    while (bots.length > want) {
      const big = this.teamSize('red') >= this.teamSize('blue') ? 'red' : 'blue';
      const b = bots.find(x => x.team === big) || bots[0];
      this.players.delete(b.id);
      bots = bots.filter(x => x !== b);
    }
    while (bots.length < want) {
      const b = this.newPlayer(BOT_NAMES[this.botSeq++ % BOT_NAMES.length], ['rifle', 'rifle', 'rifle', 'battle', 'bullpup', 'sniper'][Math.random() * 6 | 0], true, null, undefined,
        { eq: ['frag', 'frag', 'frag', 'frag', 'smoke', 'fire', 'fire', 'flash'][Math.random() * 8 | 0], sa: SIDEARMS[Math.random() * SIDEARMS.length | 0], gear: packGear({ ...randomGear(), camo: 'team' }) });
      this.spawn(b);
      bots.push(b);
    }
    for (let i = 0; i < 4; i++) {
      const r = this.teamSize('red'), bl = this.teamSize('blue');
      if (Math.abs(r - bl) <= 1) break;
      const from = r > bl ? 'red' : 'blue';
      const b = [...this.players.values()].find(p => p.bot && p.team === from);
      if (!b) break;
      b.team = from === 'red' ? 'blue' : 'red';
      this.spawn(b);
    }
  }

  spawn(p) {
    const pts = this.map.spawns[p.team];
    let best = pts[0], bs = -1;
    for (const s of pts) {
      let m = 1e9;
      for (const q of this.players.values()) if (q.alive && q.team !== p.team) m = Math.min(m, Math.hypot(q.x - s[0], q.z - s[1]));
      m += Math.random() * 6;
      if (m > bs) { bs = m; best = s; }
    }
    Object.assign(p, p.want);
    Object.assign(p, {
      x: best[0], y: 0, z: best[1], vx: 0, vy: 0, vz: 0, cr: 0, crT: 0, wl: 0, pk: 0, ground: true,
      yaw: best[2] ?? (p.team === 'red' ? Math.PI : 0), pitch: 0, hp: 100, alive: true, prot: PROTECT,
      w: p.lo, rlT: 0, next: 0, hist: [], eqN: EQUIP[p.eq].n, eqNext: 0, healT: 0,
    });
    p.mag = {}; p.res = {};
    for (const k of [p.lo, p.sa]) { p.mag[k] = WEAPONS[k].mag; p.res[k] = WEAPONS[k].reserve; }
    if (p.ai) p.ai.route = [];
    p.sp++;
    p.lastIn = now();
    p.send({ t: 'tp', x: p.x, y: p.y, z: p.z, yaw: p.yaw, sp: p.sp, lo: p.lo, sa: p.sa, eq: p.eq });
  }

  // ---- client messages ----
  onMessage(id, m) {
    const p = this.players.get(id);
    if (!p || p.bot || !m) return;
    const t = now();
    switch (m.t) {
      case 'in': {
        if (!p.alive || m.sp !== p.sp) return;
        const x = +m.x, y = +m.y, z = +m.z;
        if (![x, y, z].every(Number.isFinite)) return;
        const dt = Math.max(0.1, t - p.lastIn);
        p.lastIn = t;
        const max = PHYS.sprint * 1.5 * dt + 0.75;
        const cr = m.cr === 2 ? 2 : m.cr ? 1 : 0;
        if (Math.hypot(x - p.x, z - p.z) > max || y < -0.1 || y > 12 || hits(x, y + 0.05, z, (cr === 2 ? PHYS.hp : PHYS.hc) - 0.1, this.map.boxes)) {
          p.sp++;
          p.send({ t: 'tp', x: p.x, y: p.y, z: p.z, yaw: p.yaw, sp: p.sp });
          return;
        }
        p.x = x; p.y = y; p.z = z;
        p.yaw = wrapA(+m.yaw || 0);
        p.pitch = clampN(+m.pitch || 0, -1.5, 1.5);
        if (cr !== p.cr && t - p.crT > 0.15) { p.cr = cr; p.crT = t; }   // no flickering between stances to dodge shots
        // leaning counts only beside a real wall, and the head never goes through something
        const wl = [1, 2, 3, 4].includes(m.wl) && p.cr !== 2 && wallAt(p, m.wl, this.map.boxes, 0.45) ? m.wl : 0;
        const pk = wl ? clampN(+m.pk || 0, -1, 1) : 0, was = wl === p.wl ? p.pk : 0, can = pk || was ? peekRoom(p, wl, Math.sign(pk || was), this.map.boxes) : 0;
        p.wl = wl;
        p.pk = clampN(clampN(pk, was - 8 * dt, was + 8 * dt), -can, can);
        break;
      }
      case 'f': this.fire(p, +m.yaw, +m.pitch); break;
      case 'r': this.reload(p); break;
      case 'w':
        if (p.alive && (m.w === p.lo || m.w === p.sa) && m.w !== p.w) { p.w = m.w; p.rlT = 0; p.next = t + 0.35; }
        break;
      case 'lo': this.setLoadout(p, m); break;   // takes effect at the next spawn
      case 'g': this.useEquip(p, +m.yaw, +m.pitch); break;
      case 'c': this.chat(p, m.x); break;
      case 'po': if (Number.isFinite(m.s)) p.ping = clampN(t - m.s, 0, 1); break;
      case 'tm': this.switchTeam(p); break;
    }
  }

  // ---- private fight lobby ----
  full() { return this.teamSize('red') === this.fight && this.teamSize('blue') === this.fight; }
  switchTeam(p) {
    const to = p.team === 'red' ? 'blue' : 'red';
    if (!this.fight || this.phase !== 'wait' || this.teamSize(to) >= this.fight) return;
    p.team = to;
    this.spawn(p);
    this.roster();
    this.lobby();
  }
  // Tells everyone who is still missing, and starts or stops the countdown.
  lobby() {
    if (!this.fight || this.phase !== 'wait') return;
    const full = this.full();
    if (full && this.goT <= 0) this.goT = FIGHT_COUNT;
    if (!full) this.goT = 0;
    this.broadcast({ t: 'lb', n: this.fight, r: this.teamSize('red'), b: this.teamSize('blue'), go: this.goT > 0 ? Math.ceil(this.goT) : 0 });
  }
  toLobby() {
    this.phase = 'wait'; this.goT = 0;
    this.nades = []; this.smokes = []; this.fires = []; this.clearAir(); this.clearDrops();
    for (const p of this.players.values()) this.spawn(p);
    this.lobby();
  }

  // ---- team talk ----
  chat(p, text) {
    const x = cleanChat(text), t = now();
    if (!x) return;
    p.chatN = Math.min(CHAT_BURST, p.chatN + (t - p.chatAt) / CHAT_EVERY);
    p.chatAt = t;
    if (p.chatN < 1) { p.send({ t: 'cx' }); return; }   // too fast
    p.chatN--;
    for (const q of this.players.values()) if (!q.bot && q.team === p.team) q.send({ t: 'c', id: p.id, x });
  }

  // One voice packet, passed on to human teammates only.
  voice(id, data) {
    const p = this.players.get(id), t = now();
    if (!p || p.bot || data.byteLength !== PACKET) return;
    p.voiceN = Math.min(VOICE_PER_SEC, p.voiceN + (t - p.voiceAt) * VOICE_PER_SEC * 1.1);
    p.voiceAt = t;
    if (p.voiceN < 1) return;
    p.voiceN--;
    let packet = null;
    for (const q of this.players.values()) {
      if (q === p || q.team !== p.team || !q.sendBin) continue;
      if (!packet) { packet = new Uint8Array(4 + PACKET); new DataView(packet.buffer).setUint32(0, id, true); packet.set(data, 4); }
      q.sendBin(packet);
    }
  }

  // ---- combat ----
  fire(p, yaw, pitch) {
    const t = now();
    if (!p.alive || this.phase !== 'play' || p.rlT > 0 || t < p.next) return;
    const W = WEAPONS[p.w];
    if (!W) return;
    if (p.mag[p.w] <= 0) { this.reload(p); return; }
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
    if (!p.bot && Math.abs(wrapA(yaw - p.yaw)) > 0.35) yaw = p.yaw; // shots must stay near reported aim
    p.mag[p.w]--;
    p.next = t + W.rate * 0.9;
    p.prot = 0;
    const o = eyeOf(p);
    // lag compensation: test targets where the shooter saw them
    const rt = t - (p.bot ? 0 : Math.min(0.3, p.ping / 2 + 0.1));
    const targets = [];
    for (const q of this.players.values()) if (q !== p && q.alive && q.team !== p.team) targets.push([q, this.posAt(q, rt)]);
    const ends = [], tally = new Map();   // target -> { dmg, head } summed over pellets
    for (let i = 0; i < (W.pellets || 1); i++) {
      const s = W.pellets ? W.pelletSpread : 0;   // pellets scatter on the server so clients cannot choose the pattern
      const d = dirFrom(yaw + rnd(-s, s), clampN(pitch + rnd(-s, s), -1.5, 1.5));
      let bt = rayMap(o, d, this.map.boxes, W.range), best = null, head = false, flight = null;
      for (const [q, at] of targets) {
        const h = hitbox(o, d, at);
        if (h.t < bt) { bt = h.t; best = q; head = h.head; }
      }
      for (const s of this.flights) {                     // enemy helicopters
        if (s.k !== 'heli' || s.tm === p.team || s.down != null || rt < s.t0) continue;
        const c = heliAt(s, rt - s.t0), h = rayBox(o, d, [c[0] - 2, c[1] - 1.3, c[2] - 2], [c[0] + 2, c[1] + 1.5, c[2] + 2]);
        if (h < bt) { bt = h; best = null; flight = s; }
      }
      for (const n of this.nades) {                       // enemy charges can be shot
        if (!n.stuck || n.team === p.team) continue;
        const h = rayBox(o, d, [n.x - 0.16, n.y - 0.12, n.z - 0.16], [n.x + 0.16, n.y + 0.16, n.z + 0.16]);
        if (h < bt + 0.2) { bt = h; best = flight = null; this.dropNade(n); this.broadcast({ t: 'gx', id: n.id, w: 'fizz', p: [n.x, n.y, n.z].map(r2) }); break; }
      }
      ends.push([o[0] + d[0] * bt, o[1] + d[1] * bt, o[2] + d[2] * bt].map(r2));
      if (flight) this.hitHeli(p, flight, damageAt(W, bt, false), t);
      if (!best) continue;
      const e = tally.get(best) || { dmg: 0, head: false };
      e.dmg += damageAt(W, bt, head); e.head ||= head;
      tally.set(best, e);
    }
    const shot = { t: 'sh', id: p.id, w: p.w, o: o.map(r2), e: ends[0], hit: tally.size ? 1 : 0 };
    if (ends.length > 1) shot.m = ends.slice(1);
    this.broadcast(shot, p.id);
    for (const [q, e] of tally) this.damage(p, q, Math.round(e.dmg), e.head);
  }

  // ---- equipment ----
  useEquip(p, yaw, pitch) {
    const t = now(), E = EQUIP[p.eq];
    if (!p.alive || this.phase !== 'play' || t < p.eqNext) return;
    const set = E.sticky && this.nades.find(n => n.by === p.id && n.w === p.eq);
    if (set) {                             // a second press blows the charge
      if (!set.stuck) return;
      this.burst(set, t);
      p.eqNext = t + 0.6;
      return;
    }
    if (p.eqN <= 0) return;
    if (E.heal) {
      if (p.hp >= 100 || p.healT > 0) return;
      p.healT = E.over;
      p.send({ t: 'heal' });
    } else {
      if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
      if (Math.abs(wrapA(yaw - p.yaw)) > 0.35) yaw = p.yaw;
      const n = { id: this.nadeSeq++, w: p.eq, by: p.id, team: p.team, fuse: E.fuse, acc: 0, stuck: false, ...nadeStart(p, yaw, clampN(pitch, -1.5, 1.5), E) };
      this.nades.push(n);
      this.broadcast({ t: 'gt', id: n.id, w: n.w, by: p.id, tm: n.team, o: [n.x, n.y, n.z], v: [n.vx, n.vy, n.vz] });
    }
    p.eqN--;
    p.eqNext = t + 1;
    p.rlT = 0;                             // hands are busy
    p.next = Math.max(p.next, t + 0.4);
    p.prot = 0;
  }

  updateNades(dt, t) {
    if (this.smokes.length) this.smokes = this.smokes.filter(s => s.until > t);
    for (const n of [...this.nades]) {
      const E = EQUIP[n.w];
      for (n.acc += dt; n.acc >= NADE_DT && !n.stuck; n.acc -= NADE_DT) {
        if (!stepNade(n, NADE_DT, this.map.boxes)) continue;
        if (E.impact) n.fuse = 0;
        if (E.sticky) { n.stuck = true; n.vx = n.vy = n.vz = 0; this.broadcast({ t: 'gs', id: n.id, p: [n.x, n.y, n.z].map(r2) }); }
      }
      if ((n.fuse -= dt) <= 0) this.burst(n, t);
    }
    for (const f of [...this.fires]) {
      if (t >= f.until) { this.fires.splice(this.fires.indexOf(f), 1); continue; }
      if (t >= f.next) { f.next = t + 0.5; this.burn(f); }
    }
  }

  dropNade(n) {
    const at = this.nades.indexOf(n);
    if (at >= 0) this.nades.splice(at, 1);
    return at >= 0;
  }

  burst(n, t) {
    if (!this.dropNade(n)) return;         // the match ended in this very tick
    const E = EQUIP[n.w];
    if (E.burns) n.y = Math.max(0, n.y - rayMap([n.x, n.y, n.z], [0, -1, 0], this.map.boxes, 50));   // fire falls to the floor
    const msg = { t: 'gx', id: n.id, w: n.w, p: [n.x, n.y, n.z].map(r2) };
    if (E.lasts) { msg.d = E.lasts; this.smokes.push({ x: n.x, y: n.y, z: n.z, until: t + E.lasts }); }
    if (E.burns) { msg.d = E.burns; this.fires.push({ x: n.x, y: n.y, z: n.z, until: t + E.burns, by: n.by, team: n.team, next: t + 0.25 }); }
    this.broadcast(msg);
    if (E.dmg) this.explode(n, E);
    if (E.blind) this.dazzle(n, E);
  }

  // Everyone a bomb thrown by p's team may touch: the other team and the thrower.
  *victims(n) {
    for (const q of [...this.players.values()]) if (q.alive && (q.team !== n.team || q.id === n.by)) yield q;
  }

  clear(a, b) {                            // nothing solid between two points
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d) || 0.01;
    return rayMap(a, d.map(v => v / L), this.map.boxes, L) >= L - 0.1;
  }

  burn(f) {
    const p = this.players.get(f.by);
    if (!p) { f.until = 0; return; }
    for (const q of this.victims(f)) {
      if (this.phase !== 'play') return;
      const dy = q.y - f.y;
      if (dy < -0.6 || dy > 1.6 || Math.hypot(q.x - f.x, q.z - f.z) > EQUIP.fire.radius) continue;
      if (this.clear([f.x, f.y + 0.35, f.z], [q.x, q.y + 0.4, q.z])) this.damage(p, q, EQUIP.fire.tick, false, 'fire', [f.x, f.z]);
    }
  }

  dazzle(n, E) {
    for (const q of this.victims(n)) {
      if (q.prot > 0) continue;
      const eye = eyeOf(q), d = [n.x - eye[0], n.y + 0.2 - eye[1], n.z - eye[2]], L = Math.hypot(...d) || 0.01;
      if (L > E.radius || !this.clear(eye, [n.x, n.y + 0.2, n.z])) continue;
      const look = dirFrom(q.yaw, q.pitch), dot = (look[0] * d[0] + look[1] * d[1] + look[2] * d[2]) / L;
      const sec = E.blind * (1 - L / E.radius * 0.7) * (dot > 0.35 ? 1 : dot > -0.2 ? 0.6 : 0.25);
      q.send({ t: 'fl', s: r2(sec) });
      if (q.ai) { q.ai.blind = sec + 0.4; q.ai.target = 0; }
    }
  }

  explode(n, E) {
    const p = this.players.get(n.by), o = [n.x, n.y + 0.15, n.z];
    if (!p && n.by) return;                // the thrower left; bombs from a plane have none
    for (const q of this.victims(n)) {       // your own bomb can hurt you, not your team
      if (this.phase !== 'play') return;
      let near = Infinity;
      for (const h of [0.3, 0.9, 1.5].filter(h => h < stanceH(q.cr) + leanOff(q).y)) {
        const at = [q.x, q.y + h, q.z], L = Math.hypot(at[0] - o[0], at[1] - o[1], at[2] - o[2]);
        if (L < near && L < E.radius && this.clear(o, at)) near = L;
      }
      if (near === Infinity) continue;
      const k = near <= E.full ? 1 : 1 - (near - E.full) / (E.radius - E.full);
      this.damage(p, q, Math.max(1, Math.round(E.dmg * k)), false, n.w, [n.x, n.z]);
    }
  }

  /* ---- air: bombers and helicopters, only on lands that have them ---- */
  // Both sides get the same flights in turn. They only hurt the other team, and their kills give no points.
  clearAir() {
    this.flights = [];
    this.airNext = now() + 9;
    this.airTurn = Math.random() < 0.5 ? 0 : 1;
    this.airN = 0;
  }

  flightMsg(s, t) { return { t: 'air', id: s.id, k: s.k, tm: s.tm, a: r2(t - s.t0), dir: s.dir, z: s.z, b: s.b, down: s.down }; }

  updateAir(t) {
    if (t >= this.airNext && this.humanCount()) {
      const tm = (this.airN + this.airTurn) % 2 ? 'blue' : 'red', k = (this.airN >> 1) % 2 ? 'heli' : 'bomb';
      this.airN++;
      this.airNext = t + rnd(9, 13);
      this.launch(k, tm, t);
    }
    for (const s of [...this.flights]) {
      const at = t - s.t0;
      if (at > flightLife(s)) { this.flights.splice(this.flights.indexOf(s), 1); continue; }
      if (s.k === 'heli') { if (s.down == null && heliFiring(at)) this.heliGun(s, at, t); continue; }
      for (; s.hits < s.order.length && at >= bombLands(s.order[s.hits]); s.hits++) {
        const [x, y, z] = s.order[s.hits];
        this.broadcast({ t: 'gx', id: 0, w: 'bomb', p: [x, y, z] });
        this.explode({ w: 'bomb', by: 0, team: s.tm, x, y, z }, BOMBER);
      }
    }
  }

  launch(k, tm, t) {
    const [hx, hz] = this.map.size, dir = Math.random() < 0.5 ? 1 : -1, s = { id: this.airSeq++, k, tm, t0: t, dir, z: 0 };
    if (k === 'bomb') {                    // near one of the enemies, never at the spawns
      const foes = [...this.players.values()].filter(q => q.alive && q.team !== tm), q = foes[Math.random() * foes.length | 0] || { x: 0, z: 0 };
      const cx = clampN(q.x + rnd(-9, 9), 12 - hx, hx - 12);
      s.z = r2(clampN(q.z + rnd(-9, 9), 24 - hz, hz - 24));
      const ground = (x, z) => 60 - rayMap([x, 60, z], [0, -1, 0], this.map.boxes, 60);
      s.b = bombRun(dir, cx, s.z, ground, () => rnd(-1.5, 1.5)).map(b => b.map(r2));
      s.order = [...s.b].sort((a, b) => a[4] - b[4]);
      s.hits = 0;
    } else {                               // stays over its own half
      s.z = r2((tm === 'red' ? -1 : 1) * hz * rnd(0.3, 0.45));
      Object.assign(s, { hp: HELI.hp, left: 0, next: 0, target: 0, aim: null });
    }
    this.flights.push(s);
    this.broadcast(this.flightMsg(s, t));
  }

  // Short bursts. The rounds start a few metres off and walk onto the target, so there is time to move.
  heliGun(s, at, t) {
    if (t < s.next) return;
    const c = heliAt(s, at), o = [c[0], c[1] - 1.3, c[2]];
    const seen = q => {
      const e = [q.x, q.y + 1, q.z], L = Math.hypot(e[0] - o[0], e[1] - o[1], e[2] - o[2]);
      return q.alive && q.team !== s.tm && q.prot <= 0 && L < HELI.range && this.clear(o, e) && !this.smoked(o, e);
    };
    if (!s.left) {
      const foes = [...this.players.values()].filter(seen), q = foes[Math.random() * foes.length | 0], a = rnd(0, 6.283);
      s.left = HELI.burst;
      s.target = q ? q.id : 0;
      s.aim = q ? [q.x + Math.cos(a) * 5, 0, q.z + Math.sin(a) * 5] : [c[0] + rnd(-14, 14), 0, -s.z * rnd(0, 1.2) + rnd(-6, 6)];
    }
    s.left--;
    s.next = Math.max(s.next + HELI.rate, t - HELI.rate) + (s.left ? 0 : rnd(...HELI.rest));
    const q = s.target && this.players.get(s.target);
    if (q && seen(q)) [q.x, q.y + 0.9, q.z].forEach((v, i) => { s.aim[i] += (v - s.aim[i]) * 0.16; });
    const d = [s.aim[0] + rnd(-1, 1) - o[0], s.aim[1] + rnd(-0.6, 0.6) - o[1], s.aim[2] + rnd(-1, 1) - o[2]], L = Math.hypot(...d);
    for (let i = 0; i < 3; i++) d[i] /= L;
    let bt = rayMap(o, d, this.map.boxes, 160), best = null;
    for (const p of this.players.values()) if (p.alive && p.team !== s.tm) { const h = hitbox(o, d, p); if (h.t < bt) { bt = h.t; best = p; } }
    this.broadcast({ t: 'ah', id: s.id, e: [o[0] + d[0] * bt, o[1] + d[1] * bt, o[2] + d[2] * bt].map(r2), hit: best ? 1 : 0 });
    if (best) this.damage(null, best, HELI.dmg, false, 'heligun', [c[0], c[2]]);
  }

  hitHeli(p, s, dmg, t) {
    if (s.down != null) return;
    s.hp -= dmg;
    const gone = s.hp <= 0;
    p.send({ t: 'hit', head: 0, kill: gone ? 1 : 0, dmg: Math.round(dmg) });
    if (!gone) return;
    s.down = r2(t - s.t0);
    this.broadcast({ t: 'ad', id: s.id, by: p.id, down: s.down });
  }

  /* ---- medkits falling onto the land ---- */
  clearDrops() {
    this.drops = [];                       // { id, x, y, z, at: lands, until }
    this.dropSeq ||= 1;
    this.dropNext = now() + rnd(...DROP.every);
  }

  dropMsg(d, t) { return { t: 'hd', id: d.id, p: [d.x, d.y, d.z], f: r2(Math.max(0, d.at - t)) }; }

  // A random spot that people can walk to, away from the spawns, the other kits and the players.
  dropSpot() {
    const { points, main } = this.map.nav, spawns = [...this.map.spawns.red, ...this.map.spawns.blue];
    for (let i = 0; i < 30; i++) {
      const [x, z] = points[main[Math.random() * main.length | 0]];
      if (spawns.some(s => Math.hypot(s[0] - x, s[1] - z) < 12)) continue;
      if (this.drops.some(d => Math.hypot(d.x - x, d.z - z) < 10)) continue;
      if ([...this.players.values()].some(q => q.alive && Math.hypot(q.x - x, q.z - z) < 5)) continue;
      return [x, groundAt(this.map.boxes, x, z), z];
    }
    return null;
  }

  updateDrops(t) {
    for (const d of [...this.drops]) if (t >= d.until) { this.drops.splice(this.drops.indexOf(d), 1); this.broadcast({ t: 'hx', id: d.id }); }
    if (t >= this.dropNext) {
      this.dropNext = t + rnd(...DROP.every);
      const at = this.drops.length < DROP.max && this.humanCount() && this.map.nav.main.length && this.dropSpot();
      if (at) {
        const d = { id: this.dropSeq++, x: at[0], y: at[1], z: at[2], at: t + DROP.fall, until: t + DROP.fall + DROP.life };
        this.drops.push(d);
        this.broadcast(this.dropMsg(d, t));
      }
    }
    for (const d of [...this.drops]) {
      if (t < d.at) continue;              // still falling
      for (const p of this.players.values()) {
        if (!p.alive || p.hp >= 100 || Math.hypot(p.x - d.x, p.z - d.z) > DROP.reach || Math.abs(p.y - d.y) > 1.2) continue;
        p.hp = Math.min(100, p.hp + DROP.heal);
        this.drops.splice(this.drops.indexOf(d), 1);
        this.broadcast({ t: 'hx', id: d.id, by: p.id });
        break;
      }
    }
  }

  // Is the straight line from a to b cut by smoke?
  smoked(a, b) {
    const t = now(), r = EQUIP.smoke.radius;
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], LL = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
    return this.smokes.some(s => {
      if (s.until <= t) return false;
      const k = clampN(((s.x - a[0]) * d[0] + (s.y + 1 - a[1]) * d[1] + (s.z - a[2]) * d[2]) / LL, 0, 1);
      return Math.hypot(a[0] + d[0] * k - s.x, a[1] + d[1] * k - s.y - 1, a[2] + d[2] * k - s.z) < r;
    });
  }

  damage(p, q, dmg, head, w = p.w, from = [p.x, p.z]) {
    if (q.bot && p) { q.ai.hurtBy = p.id; q.ai.scan = 0; }
    if (q.prot > 0) return;
    q.hp -= dmg;
    const kill = q.hp <= 0;
    if (p && p !== q) p.send({ t: 'hit', head: head ? 1 : 0, kill: kill ? 1 : 0, dmg });
    q.send({ t: 'dmg', from: from.map(r2), hp: Math.ceil(Math.max(0, q.hp)) });
    if (kill) this.kill(q, p, head, w);
  }

  posAt(q, t) {
    const h = q.hist;
    if (!h.length || t >= h[h.length - 1].t) return q;
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t) {
        const k = (t - a.t) / ((b.t - a.t) || 1);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: b.yaw, cr: b.cr, wl: b.wl, pk: a.wl === b.wl ? a.pk + (b.pk - a.pk) * k : b.pk };
      }
    }
    return h[0];
  }

  kill(q, p, head, w = p ? p.w : '') {
    for (const n of [...this.nades]) if (n.stuck && n.by === q.id) { this.dropNade(n); this.broadcast({ t: 'gx', id: n.id, w: 'fizz', p: [n.x, n.y, n.z].map(r2) }); }   // charges die with their owner
    q.alive = false; q.hp = 0; q.rsT = RESPAWN; q.d++;
    if (p && p !== q) { p.k++; this.score[p.team]++; }
    this.broadcast({ t: 'k', k: p ? p.id : 0, v: q.id, w, hs: head ? 1 : 0 });
    this.roster();
    if (p && this.score[p.team] >= this.killLimit) this.endMatch();
  }

  reload(p) {
    const W = WEAPONS[p.w];
    if (!p.alive || p.rlT > 0 || !W || p.mag[p.w] >= W.mag || p.res[p.w] <= 0) return;
    p.rlT = W.reload;
    p.send({ t: 'rl', d: W.reload });
  }

  // win: the team that wins anyway (the other side left a private fight)
  endMatch(win) {
    if (this.phase !== 'play') return;
    this.phase = 'end';
    this.endT = 10;
    this.nades = []; this.fires = []; this.clearAir(); this.clearDrops();
    const s = this.score;
    this.broadcast({ t: 'end', winner: win || (s.red === s.blue ? 'draw' : s.red > s.blue ? 'red' : 'blue'), score: [s.red, s.blue], fight: this.fight ? 1 : 0, left: win ? 1 : 0 });
  }

  resetMatch() {
    this.phase = 'play';
    this.timeLeft = this.matchTime;
    this.score = { red: 0, blue: 0 };
    this.nades = []; this.smokes = []; this.fires = []; this.clearAir(); this.clearDrops();
    for (const p of this.players.values()) { p.k = 0; p.d = 0; this.spawn(p); }
    this.broadcast({ t: 'start' });
    this.roster();
  }

  broadcast(m, except) { for (const p of this.players.values()) if (p.id !== except) p.send(m); }

  roster() {
    this.broadcast({ t: 'ro', ps: [...this.players.values()].map(p => ({ id: p.id, n: p.name, tm: p.team, k: p.k, d: p.d, b: p.bot ? 1 : 0, g: p.gear })) });
  }

  // ---- simulation tick ----
  update(dt) {
    const t = now();
    if (this.phase === 'play') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endMatch(); }
    } else if (this.phase === 'end') {
      this.endT -= dt;
      if (this.endT <= 0) { if (this.fight) this.toLobby(); else this.resetMatch(); }   // a private fight waits until everyone is back
    } else if (this.phase === 'wait' && this.goT > 0) {
      const was = Math.ceil(this.goT);
      this.goT -= dt;
      if (this.goT <= 0) { this.goT = 0; this.resetMatch(); }
      else if (Math.ceil(this.goT) !== was) this.broadcast({ t: 'lb', n: this.fight, r: this.teamSize('red'), b: this.teamSize('blue'), go: Math.ceil(this.goT) });
    }
    this.updateNades(dt, t);
    if (this.map.air && this.phase === 'play') this.updateAir(t);
    if (this.phase === 'play') this.updateDrops(t);
    for (const p of this.players.values()) {
      if (!p.alive) {
        if (this.phase === 'play' && (p.rsT -= dt) <= 0) this.spawn(p);
        continue;
      }
      if (p.prot > 0) p.prot -= dt;
      if (p.healT > 0) {
        const E = EQUIP.med;
        p.hp = Math.min(100, p.hp + E.heal / E.over * Math.min(dt, p.healT));
        p.healT -= dt;
      }
      if (p.rlT > 0 && (p.rlT -= dt) <= 0) {
        p.rlT = 0;
        const W = WEAPONS[p.w], n = Math.min(W.mag - p.mag[p.w], p.res[p.w]);
        p.mag[p.w] += n; p.res[p.w] -= n;
      }
      if (p.bot && this.phase === 'play') this.bot(p, dt);
      p.hist.push({ t, x: p.x, y: p.y, z: p.z, yaw: p.yaw, cr: p.cr, wl: p.wl, pk: p.pk });
      while (p.hist.length && p.hist[0].t < t - 1) p.hist.shift();
    }
    this.pingAcc += dt;
    if (this.pingAcc > 2) { this.pingAcc = 0; for (const p of this.players.values()) if (!p.bot) p.send({ t: 'pi', s: t }); }
    this.snapAcc += dt;
    if (this.snapAcc >= SNAP_RATE) { this.snapAcc %= SNAP_RATE; this.snapshot(t); }   // keeps the remainder, or a 30 a second tick would only give 15
  }

  snapshot(t) {
    const ps = [];
    for (const p of this.players.values()) {
      const a = [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), p.cr, p.alive ? 1 : 0, p.w, p.team === 'red' ? 0 : 1];
      if (p.wl) a.push(p.wl, r2(p.pk));
      ps.push(a);
    }
    const base = { t: 's', ts: t, ps, sc: [this.score.red, this.score.blue], tl: Math.ceil(this.timeLeft), ph: this.phase };
    for (const p of this.players.values()) {
      if (p.bot) continue;
      p.send({ ...base, me: {
        hp: Math.ceil(p.hp), eq: p.eqN, a: p.mag[p.w] ?? 0, r: p.res[p.w] ?? 0, w: p.w, al: p.alive ? 1 : 0,
        rs: p.alive ? 0 : Math.max(0, r2(p.rsT)), rl: p.rlT > 0 ? 1 : 0, pg: Math.round(p.ping * 1000),
        pr: p.prot > 0 ? 1 : 0, sp: p.sp,
      } });
    }
  }

  // ---- bots ----
  bot(b, dt) {
    const a = b.ai;
    const eh = stanceEye(b.cr), o = [b.x, b.y + eh, b.z];
    // the spot to look for and aim at: the chest, or the head of someone who leans out from a wall
    const spot = q => { const l = leanOff(q), out = Math.abs(q.pk) > 0.3; return [q.x + l.x, q.y + (out ? stanceEye(q.cr) - 0.1 : [1.3, 0.9, 0.25][q.cr]) + l.y, q.z + l.z]; };
    a.scan -= dt;
    a.bombT -= dt;
    if (a.blind > 0) { a.blind -= dt; a.scan = 0.1; a.target = 0; }
    if (a.scan <= 0) {
      a.scan = 0.2;
      let best = null, bd = 60;
      for (const q of this.players.values()) {
        if (!q.alive || q.team === b.team) continue;
        const dx = q.x - b.x, dz = q.z - b.z, d = Math.hypot(dx, dz);
        if (d > bd) continue;
        if (Math.abs(wrapA(Math.atan2(-dx, -dz) - b.yaw)) > 1.6 && a.hurtBy !== q.id) continue;
        const c = spot(q), dir = [c[0] - o[0], c[1] - o[1], c[2] - o[2]];
        const L = Math.hypot(dir[0], dir[1], dir[2]);
        dir[0] /= L; dir[1] /= L; dir[2] /= L;
        if (rayMap(o, dir, this.map.boxes, L) < L - 0.2 || this.smoked(o, c)) continue;
        bd = d; best = q;
      }
      if (best && best.id !== a.target) a.react = rnd(0.3, 0.7) + (bd > 30 ? 0.2 : 0);
      a.target = best ? best.id : 0;
      a.hurtBy = 0;
    }
    const tq = a.target && this.players.get(a.target);
    let ix = 0, iz = 0, speed = PHYS.walk;
    if (tq && tq.alive) {
      const c = spot(tq), dx = c[0] - b.x, dz = c[2] - b.z, d = Math.hypot(dx, dz);
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(c[1] - (b.y + eh), d);
      b.yaw = wrapA(b.yaw + clampN(wrapA(ty - b.yaw), -4 * dt, 4 * dt));
      b.pitch += clampN(tp - b.pitch, -3 * dt, 3 * dt);
      if ((a.strafeT -= dt) <= 0) { a.strafeT = rnd(0.6, 1.6); a.strafe = Math.random() < 0.5 ? -1 : 1; a.kneel = d > 14 && Math.random() < 0.4; }
      b.cr = fitStance(b, a.kneel ? 1 : 0, this.map.boxes);
      ix = Math.cos(b.yaw) * a.strafe; iz = -Math.sin(b.yaw) * a.strafe;
      if (d > (b.w === 'sniper' ? 30 : 14)) { ix += -Math.sin(b.yaw) * 0.8; iz += -Math.cos(b.yaw) * 0.8; }
      speed = b.cr ? PHYS.crouch : PHYS.walk * 0.8;
      if (a.react > 0) a.react -= dt;
      else if (Math.abs(wrapA(ty - b.yaw)) < 0.12) {
        const e = a.err * (1 + d / 40);
        if (a.bombT <= 0 && d > 11 && d < 26 && b.eqN > 0) {          // lob one now and then
          a.bombT = rnd(14, 30);
          this.useEquip(b, b.yaw + rnd(-0.06, 0.06), clampN((d - 14) * 0.028, -0.1, 0.4));
        }
        this.fire(b, b.yaw + rnd(-e, e), b.pitch + rnd(-e, e) * 0.6);
      }
    } else {
      b.cr = fitStance(b, 0, this.map.boxes);
      if (b.cr) speed = b.cr === 2 ? PHYS.prone : PHYS.crouch;
      while (a.route.length && Math.hypot(a.route[0][0] - b.x, a.route[0][1] - b.z) < 0.8) a.route.shift();
      if (!a.route.length) a.route = randomRoute(this.map, b.x, b.z);
      const wp = a.route[0], dx = wp[0] - b.x, dz = wp[1] - b.z, d = Math.hypot(dx, dz) || 1;
      ix = dx / d; iz = dz / d;
      b.yaw = wrapA(b.yaw + clampN(wrapA(Math.atan2(-dx, -dz) - b.yaw), -3 * dt, 3 * dt));
      b.pitch *= 0.9;
      if (b.mag[b.w] < WEAPONS[b.w].mag * 0.4) this.reload(b);
      a.stuckT += dt;
      if (a.stuckT > 1) {
        if (Math.hypot(b.x - a.sx, b.z - a.sz) < 0.4) { a.route = []; if (b.ground) b.vy = PHYS.jump; }
        a.stuckT = 0; a.sx = b.x; a.sz = b.z;
      }
    }
    const l = Math.hypot(ix, iz);
    if (l > 1) { ix /= l; iz /= l; }
    if (b.mag[b.w] === 0) this.reload(b);
    step(b, ix, iz, speed, dt, this.map.boxes);
  }
}
