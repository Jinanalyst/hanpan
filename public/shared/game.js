// Authoritative match logic. Isomorphic: the Node server runs it for online play,
// the browser runs the same code for offline practice.
import { getMap, randomRoute } from './map.js';
import { PHYS, step, rayMap, dirFrom, hits, hitbox } from './physics.js';
import { WEAPONS, isPrimary, damageAt } from './weapons.js';
import { PACKET } from './adpcm.js';

export const MATCH_TIME = 600;   // seconds
export const KILL_LIMIT = 50;
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
  }

  humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }
  botCount() { return this.players.size - this.humanCount(); }
  teamSize(t) { let n = 0; for (const p of this.players.values()) if (p.team === t) n++; return n; }

  // owned: Set of bought product ids, or 'all' (bots and offline practice)
  canUse(p, w) { const id = WEAPONS[w].product; return !id || p.owned === 'all' || p.owned.has(id); }
  pickPrimary(p, lo) { return isPrimary(lo) && this.canUse(p, lo) ? lo : 'rifle'; }

  newPlayer(name, lo, bot, send, owned = new Set()) {
    const id = this.seq++;
    const team = this.teamSize('red') <= this.teamSize('blue') ? 'red' : 'blue';
    const p = {
      id, name: bot ? name : cleanName(name), team, bot, send: send || (() => {}), owned: bot ? 'all' : owned,
      lo: 'rifle', k: 0, d: 0,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ground: true, cr: false, yaw: 0, pitch: 0,
      hp: 100, alive: false, rsT: 0, prot: 0, w: '', mag: {}, res: {}, rlT: 0, next: 0,
      hist: [], ping: 0, sp: 0, lastIn: 0,
      sendBin: null, chatN: CHAT_BURST, chatAt: now(), voiceN: VOICE_PER_SEC, voiceAt: now(),
      ai: bot ? { route: [], scan: 0, target: 0, hurtBy: 0, react: 0, strafe: 1, strafeT: 0, stuckT: 0, sx: 0, sz: 0, err: rnd(0.02, 0.05) } : null,
    };
    p.lo = this.pickPrimary(p, lo);
    this.players.set(id, p);
    return p;
  }

  addPlayer(name, lo, send, owned, sendBin) {
    const p = this.newPlayer(name, lo, false, send, owned);
    p.sendBin = sendBin || null;
    this.spawn(p);
    p.send({ t: 'welcome', id: p.id, team: p.team, room: this.id, map: this.map.id, lo: p.lo, limit: this.killLimit });
    this.balanceBots();
    this.roster();
    return p.id;
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return;
    this.balanceBots();
    this.roster();
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
      const b = this.newPlayer(BOT_NAMES[this.botSeq++ % BOT_NAMES.length], Math.random() < 0.2 ? 'sniper' : 'rifle', true);
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
    Object.assign(p, {
      x: best[0], y: 0, z: best[1], vx: 0, vy: 0, vz: 0, cr: false, ground: true,
      yaw: p.team === 'red' ? Math.PI : 0, pitch: 0, hp: 100, alive: true, prot: PROTECT,
      w: p.lo, rlT: 0, next: 0, hist: [],
    });
    p.mag = {}; p.res = {};
    for (const k of [p.lo, 'pistol']) { p.mag[k] = WEAPONS[k].mag; p.res[k] = WEAPONS[k].reserve; }
    if (p.ai) p.ai.route = [];
    p.sp++;
    p.lastIn = now();
    p.send({ t: 'tp', x: p.x, y: p.y, z: p.z, yaw: p.yaw, sp: p.sp });
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
        if (Math.hypot(x - p.x, z - p.z) > max || y < -0.1 || y > 12 || hits(x, y + 0.05, z, PHYS.hc - 0.1, this.map.boxes)) {
          p.sp++;
          p.send({ t: 'tp', x: p.x, y: p.y, z: p.z, yaw: p.yaw, sp: p.sp });
          return;
        }
        p.x = x; p.y = y; p.z = z;
        p.yaw = wrapA(+m.yaw || 0);
        p.pitch = clampN(+m.pitch || 0, -1.5, 1.5);
        p.cr = !!m.cr;
        break;
      }
      case 'f': this.fire(p, +m.yaw, +m.pitch); break;
      case 'r': this.reload(p); break;
      case 'w':
        if (p.alive && (m.w === p.lo || m.w === 'pistol') && m.w !== p.w) { p.w = m.w; p.rlT = 0; p.next = t + 0.35; }
        break;
      case 'lo': p.lo = this.pickPrimary(p, m.lo); break;
      case 'c': this.chat(p, m.x); break;
      case 'po': if (Number.isFinite(m.s)) p.ping = clampN(t - m.s, 0, 1); break;
    }
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
    const o = [p.x, p.y + (p.cr ? PHYS.eyec : PHYS.eye), p.z];
    // lag compensation: test targets where the shooter saw them
    const rt = t - (p.bot ? 0 : Math.min(0.3, p.ping / 2 + 0.1));
    const targets = [];
    for (const q of this.players.values()) if (q !== p && q.alive && q.team !== p.team) targets.push([q, this.posAt(q, rt)]);
    const ends = [], tally = new Map();   // target -> { dmg, head } summed over pellets
    for (let i = 0; i < (W.pellets || 1); i++) {
      const s = W.pellets ? W.pelletSpread : 0;   // pellets scatter on the server so clients cannot choose the pattern
      const d = dirFrom(yaw + rnd(-s, s), clampN(pitch + rnd(-s, s), -1.5, 1.5));
      let bt = rayMap(o, d, this.map.boxes, W.range), best = null, head = false;
      for (const [q, at] of targets) {
        const h = hitbox(o, d, at);
        if (h.t < bt) { bt = h.t; best = q; head = h.head; }
      }
      ends.push([o[0] + d[0] * bt, o[1] + d[1] * bt, o[2] + d[2] * bt].map(r2));
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

  damage(p, q, dmg, head) {
    if (q.bot) { q.ai.hurtBy = p.id; q.ai.scan = 0; }
    if (q.prot > 0) return;
    q.hp -= dmg;
    const kill = q.hp <= 0;
    p.send({ t: 'hit', head: head ? 1 : 0, kill: kill ? 1 : 0, dmg });
    q.send({ t: 'dmg', from: [r2(p.x), r2(p.z)], hp: Math.max(0, q.hp) });
    if (kill) this.kill(q, p, head);
  }

  posAt(q, t) {
    const h = q.hist;
    if (!h.length || t >= h[h.length - 1].t) return q;
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t) {
        const k = (t - a.t) / ((b.t - a.t) || 1);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, cr: b.cr };
      }
    }
    return h[0];
  }

  kill(q, p, head) {
    q.alive = false; q.hp = 0; q.rsT = RESPAWN; q.d++;
    if (p && p !== q) { p.k++; this.score[p.team]++; }
    this.broadcast({ t: 'k', k: p ? p.id : 0, v: q.id, w: p ? p.w : '', hs: head ? 1 : 0 });
    this.roster();
    if (p && this.score[p.team] >= this.killLimit) this.endMatch();
  }

  reload(p) {
    const W = WEAPONS[p.w];
    if (!p.alive || p.rlT > 0 || !W || p.mag[p.w] >= W.mag || p.res[p.w] <= 0) return;
    p.rlT = W.reload;
    p.send({ t: 'rl', d: W.reload });
  }

  endMatch() {
    if (this.phase !== 'play') return;
    this.phase = 'end';
    this.endT = 10;
    const s = this.score;
    this.broadcast({ t: 'end', winner: s.red === s.blue ? 'draw' : s.red > s.blue ? 'red' : 'blue', score: [s.red, s.blue] });
  }

  resetMatch() {
    this.phase = 'play';
    this.timeLeft = this.matchTime;
    this.score = { red: 0, blue: 0 };
    for (const p of this.players.values()) { p.k = 0; p.d = 0; this.spawn(p); }
    this.broadcast({ t: 'start' });
    this.roster();
  }

  broadcast(m, except) { for (const p of this.players.values()) if (p.id !== except) p.send(m); }

  roster() {
    this.broadcast({ t: 'ro', ps: [...this.players.values()].map(p => ({ id: p.id, n: p.name, tm: p.team, k: p.k, d: p.d, b: p.bot ? 1 : 0 })) });
  }

  // ---- simulation tick ----
  update(dt) {
    const t = now();
    if (this.phase === 'play') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endMatch(); }
    } else if (this.phase === 'end') {
      this.endT -= dt;
      if (this.endT <= 0) this.resetMatch();
    }
    for (const p of this.players.values()) {
      if (!p.alive) {
        if (this.phase === 'play' && (p.rsT -= dt) <= 0) this.spawn(p);
        continue;
      }
      if (p.prot > 0) p.prot -= dt;
      if (p.rlT > 0 && (p.rlT -= dt) <= 0) {
        p.rlT = 0;
        const W = WEAPONS[p.w], n = Math.min(W.mag - p.mag[p.w], p.res[p.w]);
        p.mag[p.w] += n; p.res[p.w] -= n;
      }
      if (p.bot && this.phase === 'play') this.bot(p, dt);
      p.hist.push({ t, x: p.x, y: p.y, z: p.z, cr: p.cr });
      while (p.hist.length && p.hist[0].t < t - 1) p.hist.shift();
    }
    this.pingAcc += dt;
    if (this.pingAcc > 2) { this.pingAcc = 0; for (const p of this.players.values()) if (!p.bot) p.send({ t: 'pi', s: t }); }
    this.snapAcc += dt;
    if (this.snapAcc >= SNAP_RATE) { this.snapAcc = 0; this.snapshot(t); }
  }

  snapshot(t) {
    const ps = [];
    for (const p of this.players.values()) ps.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), p.cr ? 1 : 0, p.alive ? 1 : 0, p.w, p.team === 'red' ? 0 : 1]);
    const base = { t: 's', ts: t, ps, sc: [this.score.red, this.score.blue], tl: Math.ceil(this.timeLeft), ph: this.phase };
    for (const p of this.players.values()) {
      if (p.bot) continue;
      p.send({ ...base, me: {
        hp: p.hp, a: p.mag[p.w] ?? 0, r: p.res[p.w] ?? 0, w: p.w, al: p.alive ? 1 : 0,
        rs: p.alive ? 0 : Math.max(0, r2(p.rsT)), rl: p.rlT > 0 ? 1 : 0, pg: Math.round(p.ping * 1000),
        pr: p.prot > 0 ? 1 : 0, sp: p.sp,
      } });
    }
  }

  // ---- bots ----
  bot(b, dt) {
    const a = b.ai;
    const eh = b.cr ? PHYS.eyec : PHYS.eye, o = [b.x, b.y + eh, b.z];
    a.scan -= dt;
    if (a.scan <= 0) {
      a.scan = 0.2;
      let best = null, bd = 60;
      for (const q of this.players.values()) {
        if (!q.alive || q.team === b.team) continue;
        const dx = q.x - b.x, dz = q.z - b.z, d = Math.hypot(dx, dz);
        if (d > bd) continue;
        if (Math.abs(wrapA(Math.atan2(-dx, -dz) - b.yaw)) > 1.6 && a.hurtBy !== q.id) continue;
        const c = [q.x, q.y + (q.cr ? 0.9 : 1.3), q.z], dir = [c[0] - o[0], c[1] - o[1], c[2] - o[2]];
        const L = Math.hypot(dir[0], dir[1], dir[2]);
        dir[0] /= L; dir[1] /= L; dir[2] /= L;
        if (rayMap(o, dir, this.map.boxes, L) < L - 0.2) continue;
        bd = d; best = q;
      }
      if (best && best.id !== a.target) a.react = rnd(0.3, 0.7) + (bd > 30 ? 0.2 : 0);
      a.target = best ? best.id : 0;
      a.hurtBy = 0;
    }
    const tq = a.target && this.players.get(a.target);
    let ix = 0, iz = 0, speed = PHYS.walk;
    if (tq && tq.alive) {
      const dx = tq.x - b.x, dz = tq.z - b.z, d = Math.hypot(dx, dz);
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(tq.y + (tq.cr ? 0.9 : 1.25) - (b.y + eh), d);
      b.yaw = wrapA(b.yaw + clampN(wrapA(ty - b.yaw), -4 * dt, 4 * dt));
      b.pitch += clampN(tp - b.pitch, -3 * dt, 3 * dt);
      if ((a.strafeT -= dt) <= 0) { a.strafeT = rnd(0.6, 1.6); a.strafe = Math.random() < 0.5 ? -1 : 1; }
      ix = Math.cos(b.yaw) * a.strafe; iz = -Math.sin(b.yaw) * a.strafe;
      if (d > (b.w === 'sniper' ? 30 : 14)) { ix += -Math.sin(b.yaw) * 0.8; iz += -Math.cos(b.yaw) * 0.8; }
      speed = PHYS.walk * 0.8;
      if (a.react > 0) a.react -= dt;
      else if (Math.abs(wrapA(ty - b.yaw)) < 0.12) {
        const e = a.err * (1 + d / 40);
        this.fire(b, b.yaw + rnd(-e, e), b.pitch + rnd(-e, e) * 0.6);
      }
    } else {
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
