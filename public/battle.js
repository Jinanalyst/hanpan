// War sounds: soldiers' voices, radio chatter, and far gunfire and explosions behind the match.
// Everything here runs in this browser only, from events the player already gets. A living enemy is only ever heard
// where something else gave the place away: right after a shot of theirs, or when the player has just hit them.
import { VOICES, LINES } from './voicelines.js';

const RATE = 24000, MAX_VOICES = 5, EAR = 45;   // EAR: metres past which nobody's voice is heard
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.random() * a.length | 0];
const chance = p => Math.random() < p;
// Seconds before anyone may say the same kind of thing again.
const REST = { reload: 2.5, frag: 2, grenade: 4, contact: 6, kill: 5, mandown: 7, hurt: 0.5, death: 0.15, order: 6, start: 10, far: 2, radio: 8, radiokill: 14, radiolost: 10 };
const HARD = { death: 3, grenade: 3, hurt: 2, reload: 2, frag: 2, mandown: 2 };   // the rest are 1; a more important line replaces a less important one

export const clampVolume = v => { const n = v == null || v === '' ? NaN : +v; return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.7; };

// audio(): { AC, master } once the sound device is open. blocked(a, b): true when a wall stands between two points.
export function createBattle({ audio, blocked = () => false }) {
  let AC = null, out = null, duck = null, bed = null, room = null, rumble = null;
  let volume = 0.7, loading = null, clips = null, ready = false, level = -1;
  let far = null;                          // { shots, booms, rumble } made once, off the main thread
  const speaking = new Set(), byPlayer = new Map(), last = {}, recent = {};
  let nextShot = 0, nextBoom = 0, nextFar = 0, nextRadio = 0, nextOrder = 0;
  const later = [];                        // { at, f }

  const now = () => performance.now() / 1000;

  function graph() {
    if (AC) return true;
    const a = audio();
    if (!a) return false;
    AC = a.AC;
    out = AC.createGain(); out.gain.value = 0;
    duck = AC.createGain();
    const limit = AC.createDynamicsCompressor();   // many voices at once never drown the guns
    limit.threshold.value = -20; limit.ratio.value = 6; limit.attack.value = 0.004; limit.release.value = 0.2;
    const trim = AC.createGain(); trim.gain.value = 0.6;   // the compressor makes everything louder; this takes it back
    limit.connect(trim).connect(duck).connect(out).connect(a.master);
    bed = AC.createGain(); bed.connect(limit);
    room = AC.createConvolver();                   // the echo of a street, for far voices
    const len = AC.sampleRate * 1.3 | 0, ir = AC.createBuffer(2, len, AC.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-5 * i / len) * (i < 900 ? i / 900 : 1); }
    room.buffer = ir; room.connect(bed);
    duck.limit = limit;
    return true;
  }

  /* ---------------- the far battle, made from noise ---------------- */
  async function render(sec, build) {
    const O = new OfflineAudioContext(1, Math.ceil(sec * 22050), 22050), n = O.createBuffer(1, Math.ceil(sec * 22050), 22050), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = (at, dur, v, f0, f1, q = 0.4) => {
      const s = O.createBufferSource(), l = O.createBiquadFilter(), g = O.createGain();
      s.buffer = n; l.type = 'lowpass'; l.Q.value = q; l.frequency.setValueAtTime(f0, at); l.frequency.exponentialRampToValueAtTime(f1, at + dur);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(v, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      s.connect(l).connect(g).connect(O.destination); s.start(at, Math.random() * sec * 0.3); s.stop(at + dur);
    };
    const tone = (at, dur, v, f0, f1) => {
      const o = O.createOscillator(), g = O.createGain();
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(v, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(O.destination); o.start(at); o.stop(at + dur);
    };
    build({ O, n, noise, tone });
    return O.startRendering();
  }
  async function makeFar() {
    const shot = i => render(1.5, ({ noise, tone }) => {   // a dull crack, then its echoes off the buildings
      noise(0, 0.16, 0.9, 620 + i * 70, 260); tone(0, 0.13, 0.5, 95 + i * 8, 48);
      for (const [at, v] of [[0.13 + i * 0.03, 0.3], [0.29 + i * 0.05, 0.2], [0.52, 0.1]]) noise(at, 0.5, v, 420, 160);
    });
    const boom = i => render(4.5, ({ noise, tone }) => {
      noise(0, 0.5, 1, 380, 90); tone(0, 0.9, 0.9, 62 - i * 6, 26);
      noise(0.12, 2.2, 0.55, 190, 55); noise(0.5 + i * 0.2, 3.4, 0.3, 120, 45);
    });
    const low = render(9, ({ O, n }) => {                  // a low roll like many guns over the horizon; its ends are faded so that it loops
      const s = O.createBufferSource(), l = O.createBiquadFilter(), g = O.createGain(), N = 180, curve = new Float32Array(N);
      for (let i = 0; i < N; i++) { const t = i / (N - 1); curve[i] = Math.sin(Math.PI * t) ** 0.5 * (0.55 + 0.25 * Math.sin(t * 37) + 0.2 * Math.sin(t * 83 + 1)); }
      s.buffer = n; l.type = 'lowpass'; l.frequency.value = 105; l.Q.value = 0.6;
      g.gain.setValueCurveAtTime(curve, 0, 9); s.connect(l).connect(g).connect(O.destination); s.start();
    });
    const [s0, s1, s2, b0, b1, rumble] = await Promise.all([shot(0), shot(1), shot(2), boom(0), boom(1), low]);
    far = { shots: [s0, s1, s2], booms: [b0, b1], rumble };
  }
  function farSound(buf, at, v, pan, rate) {
    const s = AC.createBufferSource(), g = AC.createGain(), p = AC.createStereoPanner();
    s.buffer = buf; s.playbackRate.value = rate; g.gain.value = v; p.pan.value = pan;
    s.connect(g).connect(p).connect(bed); s.start(at);
  }
  function farBurst() {   // one far soldier firing, sometimes another one answering
    const answer = chance(0.4) ? 2 : 1;
    let at = AC.currentTime + 0.05;
    for (let k = 0; k < answer; k++) {
      const n = chance(0.3) ? 1 : 2 + Math.random() * 7 | 0, gap = rnd(0.085, 0.17), v = rnd(0.05, 0.12), pan = rnd(-0.9, 0.9), buf = pick(far.shots), rate = rnd(0.85, 1.12);
      for (let i = 0; i < n; i++) farSound(buf, at + i * gap * rnd(0.97, 1.03), v * rnd(0.8, 1), pan, rate);
      at += n * gap + rnd(0.3, 1);
    }
  }

  /* ---------------- voices ---------------- */
  // One file per soldier. Each is only fetched when battle sounds are on and a match is near.
  function load() {
    if (loading || volume <= 0) return;
    loading = (async () => {
      if (!graph()) { loading = null; return; }
      await Promise.all([far ? 0 : makeFar(), ...VOICES.map(async (v, i) => {
        try {
          const r = await fetch(v.file);
          if (!r.ok) throw new Error(v.file + ' ' + r.status);
          const b = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await r.arrayBuffer());
          (clips ||= [])[i] = b;
        } catch (e) { console.warn('[battle]', e); }
      })]);
      ready = true;
    })().catch(e => console.warn('[battle]', e));
  }
  // A line for this kind, in this soldier's own voice when there is one, and not one of the last few heard.
  function choose(kind, voice) {
    const all = (LINES[kind] || []).map((l, i) => ({ l, i })).filter(({ l }) => clips?.[l[0]]);
    if (!all.length) return null;
    const own = all.filter(({ l }) => l[0] === voice), old = recent[kind] ||= [];
    let from = own.filter(({ i }) => !old.includes(i));
    if (!from.length) from = own.length ? own : all.filter(({ i }) => !old.includes(i));
    const got = pick(from.length ? from : all);
    old.push(got.i); while (old.length > Math.min(4, all.length >> 1)) old.shift();
    return got.l;
  }
  const soldiers = VOICES.map((v, i) => i).filter(i => !VOICES[i].extra);
  const voiceOf = id => soldiers[Math.abs(id) * 3 % soldiers.length];
  const pitchOf = id => 0.95 + Math.abs(id) * 37 % 11 / 100;    // two soldiers with one voice still differ

  // o: { id, who: whose voice when not id's, pos: [x, y, z] or null for the player, vol, far, radio }
  function say(kind, o) {
    if (!ready || volume <= 0 || AC.state !== 'running' || !playing) return false;
    const t = now(), key = kind + (o.far ? 'far' : ''), rank = o.far || o.radio ? 0 : HARD[kind] || 1;
    if (t < (last[key] || 0) + (REST[o.far ? 'far' : kind] || 0)) return false;
    if (o.pos && !o.far && Math.hypot(o.pos[0] - ear[0], o.pos[2] - ear[2]) > EAR) return false;
    const before = byPlayer.get(o.id);
    if (before && !before.done) { if (rank <= before.rank) return false; before.stop(); }
    const live = [...speaking];
    if (live.length >= MAX_VOICES) { const low = live.sort((a, b) => a.rank - b.rank)[0]; if (low.rank >= rank) return false; low.stop(); }
    const l = choose(kind, o.radio ? -1 : voiceOf(o.who ?? o.id));
    if (!l) return false;
    last[key] = t;
    play(l, rank, o);
    return true;
  }
  function play([voice, at, dur], rank, o) {
    const gain = 0.75;
    const s = AC.createBufferSource(), g = AC.createGain(), t = AC.currentTime + (o.radio ? 0.09 : 0.01);
    const rate = (o.radio ? 1 : pitchOf(o.who ?? o.id)) * rnd(0.98, 1.02), end = t + dur / rate;
    s.buffer = clips[voice]; s.playbackRate.value = rate;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * (o.vol ?? 1), t + 0.015);
    g.gain.setValueAtTime(gain * (o.vol ?? 1), Math.max(t + 0.015, end - 0.05)); g.gain.linearRampToValueAtTime(0, end);
    s.connect(g);
    let tail = g;
    if (o.radio) {
      const hp = AC.createBiquadFilter(), lp = AC.createBiquadFilter(), dirt = AC.createWaveShaper();
      hp.type = 'highpass'; hp.frequency.value = 520; lp.type = 'lowpass'; lp.frequency.value = 2700; lp.Q.value = 1.2;
      dirt.curve = dirtCurve; tail.connect(hp).connect(dirt).connect(lp); lp.connect(duck.limit); tail = lp;
      squelch(t - 0.08, 0.07); squelch(end + 0.01, 0.12); hiss(t, end);
    } else if (o.far) {
      const lp = AC.createBiquadFilter(), p = AC.createStereoPanner(), wet = AC.createGain();
      lp.type = 'lowpass'; lp.frequency.value = rnd(650, 1000); p.pan.value = rnd(-0.9, 0.9); wet.gain.value = 0.9;
      tail.connect(lp); lp.connect(wet).connect(room); lp.connect(p).connect(bed); tail = p;
    } else if (o.pos) {
      const p = AC.createPanner(), lp = AC.createBiquadFilter(), d = Math.hypot(o.pos[0] - ear[0], o.pos[2] - ear[2]);
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1.15;
      p.positionX.value = o.pos[0]; p.positionY.value = o.pos[1]; p.positionZ.value = o.pos[2];
      lp.type = 'lowpass'; lp.frequency.value = (blocked(ear, o.pos) ? 1100 : 9000) / (1 + d * 0.025);
      tail.connect(lp).connect(p).connect(duck.limit); tail = p;
      if (d > 12) { const wet = AC.createGain(); wet.gain.value = Math.min(0.5, d / 80) / (1 + d * 0.06); lp.connect(wet).connect(room); }
    } else tail.connect(duck.limit);
    const it = {
      rank, done: false,
      stop() { if (it.done) return; const n = AC.currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, n, 0.02); s.stop(n + 0.12); it.over(); },
      over() { it.done = true; speaking.delete(it); if (byPlayer.get(o.id) === it) byPlayer.delete(o.id); },
    };
    s.onended = it.over;
    speaking.add(it); if (o.id != null) byPlayer.set(o.id, it);
    s.start(t, at, dur);
  }
  const dirtCurve = Float32Array.from({ length: 257 }, (_, i) => Math.tanh((i / 128 - 1) * 3.2) * 0.8);
  let grain = null;
  function grainBuf() { if (!grain) { grain = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = grain.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return grain; }
  function radioNoise(t, end, v) {
    const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = grainBuf(); s.loop = true; f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, end - 0.01); g.gain.linearRampToValueAtTime(0, end);
    s.connect(f).connect(g).connect(duck.limit); s.start(Math.max(t, AC.currentTime), Math.random() * 0.5); s.stop(end);
  }
  const squelch = (t, d) => radioNoise(t, t + d, 0.035);
  const hiss = (t, end) => radioNoise(t, end, 0.006);

  const me = -1;                           // the player's own voice in byPlayer
  const own = (kind, vol = 0.55) => say(kind, { id: me, who: myId, pos: null, vol });
  const radio = (kind = 'radio') => say(kind, { id: -2, radio: true, vol: 0.32 });
  const after = (sec, f) => { if (later.length < 12) later.push({ at: now() + sec, f }); };

  /* ---------------- the match ---------------- */
  let playing = false, opening = false, ear = [0, 0, 0], myId = 0, myTeam = 'red', others = new Map();
  const gun = new Map();                   // teammate id -> { w, n, t }: shots since the last reload
  const mouth = o => [o.s.x, o.s.y + [1.6, 1.1, 0.5][o.s.cr | 0], o.s.z];
  const mates = () => [...others].filter(([, o]) => o.team === myTeam && o.s.alive);
  const distTo = o => Math.hypot(o.s.x - ear[0], o.s.z - ear[2]);
  function mate(kind, id, vol = 1) { const o = others.get(id); return !!o && o.team === myTeam && !!o.s.alive && say(kind, { id, pos: mouth(o), vol }); }
  function nearMate(kind, within = 30, not = 0) {
    const l = mates().filter(([id, o]) => id !== not && distTo(o) < within).sort((a, b) => distTo(a[1]) - distTo(b[1]));
    return l.length ? mate(kind, l[0][0]) : false;
  }

  function shot(m, W) {                    // someone else fired; everyone hears the shot itself
    const o = others.get(m.id), t = now();
    if (!o) return;
    const g = gun.get(m.id) || { w: '', n: 0, t: 0 }, quiet = t - g.t;
    if (g.w !== m.w || quiet > 6) g.n = 0;
    g.w = m.w; g.n++; g.t = t; gun.set(m.id, g);
    if (o.team === myTeam) {
      if (W && g.n >= W.mag) { g.n = 0; after(0.25, () => mate('reload', m.id)); }
      else if (quiet > 7 && chance(0.4)) after(0.3, () => mate('contact', m.id));
      else if (chance(0.012)) mate('order', m.id);
    } else if (quiet > 5 && chance(0.25)) say(chance(0.5) ? 'contact' : 'order', { id: m.id, pos: m.o, vol: 0.9 });   // right on their own gunshot
  }
  function kill(m, meAt) {
    const v = others.get(m.v), k = others.get(m.k);
    if (m.v === myId) own('death', 0.6);
    else if (v) {
      say('death', { id: m.v, pos: [v.s.x, v.s.y + 1.2, v.s.z], vol: 1.1 });
      if (v.team === myTeam) { if (chance(0.6)) after(rnd(0.7, 1.3), () => nearMate('mandown', 30, m.v) || chance(0.4) && radio('radiolost')); }
    }
    const victimMine = m.v === myId || v?.team === myTeam;
    if (!victimMine && k?.team === myTeam && chance(0.55)) after(rnd(0.4, 0.9), () => mate('kill', m.k));
    if (!victimMine && m.k === myId && chance(0.35)) after(rnd(0.5, 1), () => nearMate('kill', 25) || own('kill', 0.4));
    if (!victimMine && chance(0.22)) after(rnd(1.4, 2.4), () => radio('radiokill'));
  }
  function thrown(m) {
    if (m.by === myId) { if (m.w === 'frag') own('frag', 0.45); } else if (m.tm === myTeam && m.w === 'frag') mate('frag', m.by);
  }

  document.addEventListener('visibilitychange', () => { if (AC && document.hidden) { level = -1; out.gain.setTargetAtTime(0, AC.currentTime, 0.1); } });   // no frames come to a hidden page

  return {
    load,
    get volume() { return volume; },
    set volume(v) { volume = clampVolume(v); level = -1; if (playing) load(); },
    shot, kill, thrown,
    danger() { if (chance(0.75)) nearMate('grenade', 16) || own('grenade', 0.45); },   // the Danger! line is on the screen
    hurt() { own('hurt', 0.5); },
    hitEnemy(id) { const o = others.get(id); if (o && o.s.alive && chance(0.6)) say('hurt', { id, pos: mouth(o), vol: 0.9 }); },
    reload() { if (chance(0.7)) own('reload', 0.45); },
    start() { opening = true; },
    end() { later.length = 0; },
    reset() { later.length = 0; gun.clear(); for (const s of [...speaking]) s.stop(); nextRadio = now() + rnd(6, 12); nextOrder = now() + rnd(5, 10); nextFar = now() + rnd(2, 5); },
    stats: () => ({ ready, playing, level, speaking: speaking.size, clips: clips ? clips.filter(Boolean).length : 0, last: { ...last } }),
    // Once per frame. s: { play: match is being played, paused, talk: team voice in use, cam, myId, myTeam, others }
    update(s) {
      const want = !s.play || document.hidden ? 0 : s.paused ? 0.25 : 1;
      playing = !!s.play;
      if (!AC) { if (!playing || volume <= 0 || !graph()) return; }
      if (playing && !loading) load();
      const k = want * volume;
      if (k !== level) { level = k; out.gain.cancelScheduledValues(0); out.gain.setTargetAtTime(k, AC.currentTime, want ? 0.25 : 0.1); if (!k) for (const v of [...speaking]) v.stop(); }
      const q = s.talk ? 0.3 : 1;          // real teammates first
      if (q !== duck.want) { duck.want = q; duck.gain.setTargetAtTime(q, AC.currentTime, q < 1 ? 0.06 : 0.4); }
      ({ myId, myTeam, others } = s);
      const c = s.cam, e = c.matrixWorld.elements, L = AC.listener;
      ear = [c.position.x, c.position.y, c.position.z];
      if (L.positionX) {
        L.positionX.value = ear[0]; L.positionY.value = ear[1]; L.positionZ.value = ear[2];
        L.forwardX.value = -e[8]; L.forwardY.value = -e[9]; L.forwardZ.value = -e[10];
        L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6];
      } else { L.setPosition(...ear); L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]); }
      if (far && !rumble) { rumble = AC.createBufferSource(); const g = AC.createGain(); g.gain.value = 0.32; rumble.buffer = far.rumble; rumble.loop = true; rumble.connect(g).connect(bed); rumble.start(); }
      if (!k || AC.state !== 'running') { later.length = 0; return; }
      const t = now();
      if (opening && ready) { opening = false; after(0.8, () => nearMate('start', 40) || own('start', 0.4)); after(3.5, () => radio()); }
      for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= t) { const { f } = later.splice(i, 1)[0]; f(); }
      if (far) {
        if (t > nextShot) { nextShot = t + rnd(1.2, 5); farBurst(); }
        if (t > nextBoom) { if (nextBoom) farSound(pick(far.booms), AC.currentTime, rnd(0.14, 0.3), rnd(-0.8, 0.8), rnd(0.85, 1.1)); nextBoom = t + rnd(7, 20); }
      }
      if (s.paused) return;
      if (t > nextFar) { nextFar = t + rnd(4, 10); say(pick(['far', 'far', 'order', 'contact']), { id: -3 - (Math.random() * 40 | 0), far: true, vol: rnd(0.35, 0.6) }); }
      if (t > nextRadio) { nextRadio = t + rnd(16, 34); radio(); }
      if (t > nextOrder) { nextOrder = t + rnd(9, 18); const l = mates().filter(([, o]) => distTo(o) < 35); if (l.length) mate('order', pick(l)[0]); }
    },
  };
}
