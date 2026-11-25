// Smoke tests: hit detection, bot matches, and a real WebSocket join against the server.
import { ring, area } from '../public/shared/osmgeo.js';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { Room, cleanChat, KILL_LIMIT } from '../public/shared/game.js';
import { encode, decode, FRAME, PACKET, RATE } from '../public/shared/adpcm.js';
import { getMap, addCity, isReady, randomMap, MAP_IDS, MAP_LIST } from '../public/shared/map.js';
import { REAL } from '../public/shared/realcities.js';
import { WEAPONS, EQUIP, SIDEARMS, damageAt } from '../public/shared/weapons.js';
import { GEAR, SLOTS, itemsOf, cleanGear, packGear, unpackGear, randomGear } from '../public/shared/gear.js';
import { hits, hitbox, rayMap, stanceH, fitStance, step, eyeOf, wallAt, lowWall, findWall, peekRoom, PHYS } from '../public/shared/physics.js';
import WebSocket from 'ws';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1) Hitscan: A shoots B in the open, then headshots
{
  const room = new Room({ minPlayers: 0 });
  const inbox = { a: [], b: [] };
  const a = room.addPlayer('Alpha', 'rifle', m => inbox.a.push(m));
  const b = room.addPlayer('Bravo', 'rifle', m => inbox.b.push(m));
  const A = room.players.get(a), B = room.players.get(b);
  assert.notEqual(A.team, B.team, 'players split across teams');
  Object.assign(A, { x: 0, y: 0, z: 30, yaw: 0, prot: 0 });   // open lane, looking toward -z
  Object.assign(B, { x: 0, y: 0, z: 26, prot: 0 });
  room.fire(A, 0, -0.05);                                      // aim at body
  const hit = inbox.a.find(m => m.t === 'hit');
  assert.ok(hit, 'body shot registers');
  assert.equal(hit.head, 0);
  assert.equal(B.hp, 100 - 26);
  A.next = 0;
  room.fire(A, 0, Math.atan2(1.6 - 1.6, 4));
  const hits = inbox.a.filter(m => m.t === 'hit');
  assert.equal(hits.length, 2);
  assert.equal(hits[1].head, 1, 'level aim at 4m is a headshot');
  assert.equal(B.hp, 100 - 26 - 52, 'headshot does double damage');
  A.next = 0;
  room.fire(A, 0, 0);
  assert.ok(B.hp <= 0 && !B.alive, 'B died');
  assert.ok(inbox.a.some(m => m.t === 'hit' && m.kill), 'shooter told about the kill');
  assert.equal(room.score[A.team], 1);
  console.log('ok  hitscan, headshot, kill credit');
}

// 2) Walls block bullets
{
  const room = new Room({ minPlayers: 0 });
  const a = room.addPlayer('A', 'rifle', () => {}), b = room.addPlayer('B', 'rifle', () => {});
  const A = room.players.get(a), B = room.players.get(b);
  Object.assign(A, { x: 0, y: 0, z: -2, prot: 0 });            // inside compound
  Object.assign(B, { x: 0, y: 0, z: -9, prot: 0 });            // behind the north wall... door gap is at x=0, so offset
  A.x = 4; B.x = 4;
  room.fire(A, 0, 0);
  assert.equal(B.hp, 100, 'wall stopped the shot');
  console.log('ok  walls block bullets');
}

// The first team to the kill limit wins, and the menu says the same number
{
  const room = new Room({ minPlayers: 0 }), got = [];
  const a = room.players.get(room.addPlayer('A', 'rifle', m => got.push(m))), b = room.players.get(room.addPlayer('B', 'rifle', () => {}));
  assert.equal(KILL_LIMIT, 15); assert.equal(got.find(m => m.t === 'welcome').limit, 15);
  for (let i = 1; i <= 15; i++) { assert.equal(room.phase, 'play'); room.kill(b, a, false); if (i < 15) room.spawn(b); }
  assert.equal(room.phase, 'end'); assert.equal(got.find(m => m.t === 'end').winner, a.team);
  assert.ok(fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').includes(`First team to ${KILL_LIMIT} kills wins`));
  console.log('ok  match ends at 15 kills');
}

// 3) Every land: symmetric, spawns open and connected, bots get around and score kills in two simulated minutes
for (const id of MAP_IDS) {
  const map = getMap(id);
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  for (const b of map.boxes) {
    assert.ok(map.boxes.some(c => c.kind === b.kind && near(c.min[1], b.min[1]) && near(c.max[1], b.max[1]) &&
      near(c.min[0], -b.max[0]) && near(c.max[0], -b.min[0]) && near(c.min[2], -b.max[2]) && near(c.max[2], -b.min[2])), `${id}: both halves match`);
  }
  if (map.theme.ring) for (const b of map.boxes) assert.ok(b.min[1] > 3 || b.min[0] >= -map.size[0] - 1 && b.max[0] <= map.size[0] + 1 && b.min[2] >= -map.size[1] - 1 && b.max[2] <= map.size[1] + 1, `${id}: nothing sticks out of the land`);
  for (const b of [...map.boxes, ...map.decor]) assert.ok([...b.min, ...b.max].every(Number.isFinite) && [0, 1, 2].every(i => b.max[i] > b.min[i]), `${id}: every box has a size`);
  const { points, main } = map.nav;
  assert.ok(main.length > points.length * 0.9, `${id}: floor is connected`);
  for (const [x, z] of [...map.spawns.red, ...map.spawns.blue]) {
    assert.ok(!hits(x, 0, z, PHYS.h, map.boxes), `${id}: spawn ${x},${z} is open`);
    assert.ok(main.some(k => Math.hypot(points[k][0] - x, points[k][1] - z) < 5), `${id}: spawn ${x},${z} is connected`);
  }
  const room = new Room({ minPlayers: 8, map: id, killLimit: 999 });   // long enough to measure
  assert.equal(room.map.id, id);
  room.addPlayer('Watcher', 'rifle', () => {});
  const W = room.players.get(1);
  Object.assign(W, { x: map.size[0] - 1, z: 0 });             // park the human out of the way
  assert.equal(room.players.size, 8, 'bots fill to 8');
  const realNow = performance.now.bind(performance);
  let fake = realNow(), slow = 0, legs = 0;
  const from = new Map();
  performance.now = () => fake;
  for (let i = 0; i < 30 * 120; i++) {
    fake += 1000 / 30; room.update(1 / 30); W.prot = 99; W.hp = 100;
    if (i % 60) continue;                                      // every 2s: did wandering bots actually move?
    for (const p of room.players.values()) {
      const tag = p.alive && !p.ai?.target ? p.sp : -1, f = from.get(p.id);
      if (p.bot && f && tag >= 0 && f.tag === tag) { legs++; if (Math.hypot(p.x - f.x, p.z - f.z) < 1) slow++; }
      from.set(p.id, { x: p.x, z: p.z, tag });
    }
  }
  performance.now = realNow;
  const kills = room.score.red + room.score.blue;
  assert.ok(kills > 0, `${id}: bots got kills in 2 simulated minutes`);
  assert.ok(slow < legs * 0.15, `${id}: bots are not stuck (${slow} of ${legs})`);
  console.log(`ok  ${id}: ${kills} bot kills in 2 simulated minutes (red ${room.score.red} / blue ${room.score.blue}), stuck ${slow}/${legs}`);
}

// 4) Store: paid weapons are fair, locked without ownership, and every product is in the database catalogue
{
  const ttk = (W, d) => (Math.ceil(100 / Math.round(damageAt(W, d, false) * (W.pellets || 1))) - 1) * W.rate;
  const paid = Object.keys(WEAPONS).filter(k => WEAPONS[k].product);
  for (const k of paid) for (let d = 1; d <= 120; d++) assert.ok(ttk(WEAPONS[k], d) >= ttk(WEAPONS.rifle, d) - 1e-9, `${k} does not beat the Carbine at ${d} m`);
  for (const k of ['battle', 'bullpup', ...SIDEARMS]) for (let d = 1; d <= 120; d++) assert.ok(ttk(WEAPONS[k], d) >= ttk(WEAPONS.rifle, d) - 1e-9, `${k} does not beat the Carbine at ${d} m`);
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261125055445_store.sql', import.meta.url), 'utf8');
  for (const id of [...paid.map(k => WEAPONS[k].product), ...MAP_LIST.filter(m => m.product).map(m => m.product)]) assert.ok(sql.includes(`('${id}',`), id + ' is in the catalogue');
  const room = new Room({ minPlayers: 0 }), sent = [];
  const pl = (lo, owned) => room.players.get(room.addPlayer('P', lo, m => sent.push(m), owned));
  assert.equal(pl('smg').lo, 'rifle', 'not owned: falls back to the Carbine');
  assert.equal(pl('smg', new Set(['weapon:smg'])).lo, 'smg');
  assert.equal(pl('lmg', new Set(['weapon:smg'])).lo, 'rifle');
  assert.equal(pl('lmg', 'all').lo, 'lmg', 'practice');
  for (const bad of ['pistol', '__proto__', 'constructor', null, {}]) assert.equal(pl(bad, 'all').lo, 'rifle');
  const x = pl('smg');
  room.onMessage(x.id, { t: 'w', w: 'smg' }); assert.equal(x.w, 'rifle', 'cannot switch to a locked weapon');
  room.onMessage(x.id, { t: 'lo', lo: 'smg' }); room.spawn(x); assert.equal(x.w, 'rifle', 'cannot respawn with a locked weapon');
  // shotgun: pellets add up to one hit report
  const r2 = new Room({ minPlayers: 0 }), got = [];
  const A = r2.players.get(r2.addPlayer('A', 'shotgun', m => got.push(m), 'all')), B = r2.players.get(r2.addPlayer('B', 'rifle', () => {}));
  Object.assign(A, { x: 0, y: 0, z: 30, yaw: 0, prot: 0 }); Object.assign(B, { x: 0, y: 0, z: 28, prot: 0 });
  r2.fire(A, 0, -0.2);
  const h = got.filter(m => m.t === 'hit');
  assert.equal(h.length, 1); assert.ok(B.hp < 100 && B.hp >= 10, 'a blast hurts but never kills outright'); assert.equal(h[0].dmg, 100 - B.hp); assert.equal(A.mag.shotgun, 5);
  console.log('ok  store: fair weapons, locks, catalogue, shotgun');
}

// 5) Team talk: text and voice reach teammates only, are cleaned and limited, and speech survives compression
{
  assert.equal(cleanChat('  hi\n\u202Eevil\u0000  there  '), 'hi evil there');
  assert.equal([...cleanChat('가😀'.repeat(200))].length, 120);
  for (const bad of [null, 5, {}, [], undefined]) assert.equal(cleanChat(bad), '');
  const room = new Room({ minPlayers: 0 }), P = [];
  for (let i = 0; i < 4; i++) { const p = { txt: [], bin: [] }; p.id = room.addPlayer('P' + i, 'rifle', m => p.txt.push(m), undefined, b => p.bin.push(b)); p.team = room.players.get(p.id).team; P.push(p); }
  const [a] = P, mate = P.find(p => p !== a && p.team === a.team), foes = P.filter(p => p.team !== a.team);
  assert.equal(foes.length, 2);
  const chats = p => p.txt.filter(m => m.t === 'c');
  room.onMessage(a.id, { t: 'c', x: '  안녕 <b>team</b> ' });
  assert.deepEqual(chats(mate), [{ t: 'c', id: a.id, x: '안녕 <b>team</b>' }]);
  assert.equal(chats(a).length, 1, 'sender sees it too');
  for (const f of foes) assert.equal(chats(f).length, 0, 'enemies do not see team chat');
  for (const x of ['', '   ', null, {}, '\u0000']) room.onMessage(a.id, { t: 'c', x });
  assert.equal(chats(mate).length, 1);
  for (let i = 0; i < 20; i++) room.onMessage(a.id, { t: 'c', x: 'spam ' + i });
  assert.ok(chats(mate).length <= 4 && a.txt.some(m => m.t === 'cx'), 'flood stopped');
  // voice
  const pkt = new Uint8Array(PACKET).fill(7);
  room.voice(a.id, pkt);
  assert.equal(mate.bin.length, 1); assert.equal(mate.bin[0].length, 4 + PACKET);
  assert.equal(new DataView(mate.bin[0].buffer).getUint32(0, true), a.id, 'labelled with the real sender');
  for (const p of [a, ...foes]) assert.equal(p.bin.length, 0, 'not to enemies or back to the speaker');
  room.voice(a.id, new Uint8Array(PACKET - 1)); room.voice(a.id, new Uint8Array(5000)); room.voice(999, pkt);
  assert.equal(mate.bin.length, 1, 'wrong sizes and unknown players ignored');
  for (let i = 0; i < 300; i++) room.voice(a.id, pkt);
  assert.ok(mate.bin.length <= 26, 'voice flood stopped');
  // sound quality of a speech-like signal
  const st = { value: 0, index: 0 };
  let sig = 0, err = 0;
  for (let f = 0; f < 25; f++) {
    const pcm = Int16Array.from({ length: FRAME }, (_, i) => { const t = (f * FRAME + i) / RATE; return 6000 * Math.sin(6.283 * 180 * t) + 3000 * Math.sin(6.283 * 900 * t) + 1200 * Math.sin(6.283 * 2300 * t); });
    const back = decode(encode(pcm, st));
    if (f) for (let i = 0; i < FRAME; i++) { sig += pcm[i] ** 2; err += (pcm[i] - back[i] * 32768) ** 2; }
  }
  const db = 10 * Math.log10(sig / err);
  assert.ok(db > 18, `voice quality ${db.toFixed(1)} dB`);
  console.log(`ok  team chat and voice: team only, cleaned, limited, quality ${db.toFixed(1)} dB`);
}

// 6) Character: outfits survive the trip, bad ones become standard issue, loadouts wait for the next spawn
{
  for (const s of SLOTS) assert.ok(itemsOf(s).length <= 36, s + ' fits one character');
  for (let i = 0; i < 200; i++) { const g = randomGear(); assert.deepEqual(unpackGear(packGear(g)), g); assert.equal(packGear(g).length, SLOTS.length); }
  const plain = unpackGear('');
  for (const s of SLOTS) assert.equal(plain[s], Object.keys(GEAR[s].items)[0]);
  for (const bad of [null, 5, {}, [], '~~~~', 'zzzzzzzzzzzz', '__proto__']) assert.deepEqual(unpackGear(bad), plain);
  assert.deepEqual(cleanGear({ helmet: 'constructor', vest: 5, camo: 'night', junk: 1 }), { ...plain, camo: 'night' });
  const room = new Room({ minPlayers: 0 }), got = [];
  const g = packGear({ ...plain, helmet: 'nvg', camo: 'arctic' });
  const p = room.players.get(room.addPlayer('P', 'bullpup', m => got.push(m), undefined, null, { sa: 'revolver', eq: 'med', gear: g }));
  assert.deepEqual([p.lo, p.sa, p.eq, p.w, p.eqN], ['bullpup', 'revolver', 'med', 'bullpup', 1]);
  assert.equal(got.filter(m => m.t === 'ro').at(-1).ps[0].g, g, 'others are told the outfit');
  const tp = got.find(m => m.t === 'tp'); assert.deepEqual([tp.lo, tp.sa, tp.eq], ['bullpup', 'revolver', 'med']);
  room.onMessage(p.id, { t: 'w', w: 'revolver' }); assert.equal(p.w, 'revolver');
  room.onMessage(p.id, { t: 'w', w: 'pistol' }); assert.equal(p.w, 'revolver', 'only carried guns');
  room.onMessage(p.id, { t: 'lo', lo: 'sniper', sa: 'mpistol', eq: 'smoke' });
  room.onMessage(p.id, { t: 'w', w: 'sniper' });
  assert.deepEqual([p.lo, p.w, p.mag.sniper], ['bullpup', 'revolver', undefined], 'nothing changes mid-life');
  room.spawn(p); assert.deepEqual([p.lo, p.sa, p.eq, p.eqN], ['sniper', 'mpistol', 'smoke', EQUIP.smoke.n]);
  for (const bad of [null, {}, 'rifle', '__proto__', 7]) {
    const q = room.players.get(room.addPlayer('Q', 'rifle', () => {}, undefined, null, { sa: bad, eq: bad, gear: bad }));
    assert.deepEqual([q.sa, q.eq, q.gear], ['pistol', 'frag', packGear(plain)]);
  }
  console.log('ok  character: outfit codes, bad values, sidearm and equipment, next-spawn loadout');
}

// 7) Equipment: frag (damage, cover, teammates, limits), smoke, med kit
{
  const realNow = performance.now.bind(performance);
  let fake = realNow();
  performance.now = () => fake;
  const run = (room, s) => { for (let i = 0; i < s * 30; i++) { fake += 1000 / 30; room.update(1 / 30); } };
  const make = (n, eq) => { const room = new Room({ minPlayers: 0 }), P = []; for (let i = 0; i < n; i++) { const p = { got: [] }; p.s = room.players.get(room.addPlayer('P' + i, 'rifle', m => p.got.push(m), undefined, null, { eq })); P.push(p); } return { room, P }; };
  const put = (p, x, z) => Object.assign(p.s, { x, y: 0, z, yaw: 0, prot: 0 });
  // straight at the ground far ahead, along the open lane
  const { room, P: [a, b, c, d] } = make(4, 'frag');             // a, c red; b, d blue
  put(a, 0, 30); put(b, 0, 18); put(c, 0.8, 18); put(d, 25, -25);
  room.onMessage(a.s.id, { t: 'g', yaw: 0, pitch: 0 });
  const thrown = b.got.find(m => m.t === 'gt');
  assert.ok(thrown && thrown.w === 'frag' && thrown.by === a.s.id);
  room.onMessage(a.s.id, { t: 'g', yaw: 0, pitch: 0 });
  assert.equal(a.s.eqN, 1, 'not two at once');
  run(room, 1); const mid = { ...room.nades[0] };
  assert.ok(mid.y > 0 && mid.z < 30, 'flies forward and stays above the ground');
  Object.assign(room.nades[0], { x: 0, y: 0.1, z: 16, vx: 0, vy: 0, vz: 0 });
  run(room, 1.5);
  assert.ok(b.got.some(m => m.t === 'gx'));
  assert.ok(!b.s.alive && a.s.k === 1, 'close blast kills and is credited');
  assert.equal(b.got.find(m => m.t === 'k').w, 'frag');
  assert.equal(c.s.hp, 100, 'teammates are safe'); assert.equal(d.s.hp, 100, 'out of range');
  room.spawn(b.s); put(b, 4, -9); put(a, 4, 2);                  // behind the wall from test 2
  room.onMessage(a.s.id, { t: 'g', yaw: 0, pitch: 0 });
  Object.assign(room.nades[0], { x: 4, y: 0.1, z: -5, vx: 0, vy: 0, vz: 0 });
  run(room, 2.4);
  assert.equal(b.s.hp, 100, 'walls give cover'); assert.equal(a.s.eqN, 0);
  fake += 5000; room.onMessage(a.s.id, { t: 'g', yaw: 0, pitch: 0 }); assert.equal(room.nades.length, 0, 'none left');
  // your own grenade
  room.spawn(a.s); put(a, 0, 30); run(room, 0.1); a.s.prot = 0;
  const reds = room.score.red;
  room.onMessage(a.s.id, { t: 'g', yaw: 0, pitch: 0 }); Object.assign(room.nades[0], { x: 0, y: 0.1, z: 30.5, vx: 0, vy: 0, vz: 0 }); run(room, 2.4);
  assert.ok(!a.s.alive && room.score.red === reds, 'it can kill you, without a point');
  // bad input and a thrower who leaves
  const left = make(2, 'frag'); put(left.P[0], 0, 30); put(left.P[1], 0, 28);
  for (const y of [NaN, undefined, 'x', Infinity]) left.room.onMessage(left.P[0].s.id, { t: 'g', yaw: y, pitch: 0 });
  assert.equal(left.room.nades.length, 0);
  left.room.onMessage(left.P[0].s.id, { t: 'g', yaw: 0, pitch: 0 }); left.room.removePlayer(left.P[0].s.id); run(left.room, 3);
  // a thousand throws: never inside a wall or under the ground, and no wall is thin enough to skip through in one step
  for (const id of MAP_IDS) {
    const r = new Room({ minPlayers: 0, map: id }), p = r.players.get(r.addPlayer('T', 'rifle', () => {}));
    for (const b of r.map.boxes) for (let i = 0; i < 3; i++) assert.ok(b.max[i] - b.min[i] + 0.2 > 20 / 120, id + ' has no paper-thin wall');
    for (let i = 0; i < 125; i++) {
      r.spawn(p); p.yaw = Math.random() * 6.28; fake += 2000;
      r.onMessage(p.id, { t: 'g', yaw: p.yaw, pitch: Math.random() * 1.2 - 0.6 });
      const n = r.nades[0]; assert.ok(n);
      for (let k = 0; k < 66; k++) { r.updateNades(1 / 30, fake); if (!r.nades.length) break; assert.ok(n.y > 0 && !r.map.boxes.some(b => ['x', 'y', 'z'].every((a, i) => n[a] > b.min[i] && n[a] < b.max[i])), id + ' grenade stays out of walls'); }
      r.nades = [];
    }
  }
  // smoke
  const sm = make(2, 'smoke'); put(sm.P[0], 0, 30); put(sm.P[1], 0, 10);
  sm.room.onMessage(sm.P[0].s.id, { t: 'g', yaw: 0, pitch: 0 }); Object.assign(sm.room.nades[0], { x: 0, y: 0.1, z: 20, vx: 0, vy: 0, vz: 0 }); run(sm.room, 1.7);
  assert.ok(sm.room.smoked([0, 1.6, 30], [0, 1.3, 10]), 'blocks the view'); assert.ok(!sm.room.smoked([12, 1.6, 30], [12, 1.3, 10])); assert.equal(sm.P[1].s.hp, 100);
  const late = []; sm.room.addPlayer('Late', 'rifle', m => late.push(m)); assert.ok(late.some(m => m.t === 'gx' && m.d > 10), 'late joiners see it');
  run(sm.room, 13); assert.ok(!sm.room.smoked([0, 1.6, 30], [0, 1.3, 10]), 'clears');
  // med kit
  const md = make(2, 'med'), q = md.P[0].s; q.prot = 0;
  md.room.onMessage(q.id, { t: 'g' }); assert.equal(q.eqN, 1, 'not wasted at full health');
  q.hp = 20; md.room.onMessage(q.id, { t: 'g' }); run(md.room, 1); assert.ok(q.hp > 45 && q.hp < 55); run(md.room, 2); assert.equal(Math.round(q.hp), 80); assert.equal(q.eqN, 0);
  q.hp = 90; q.eqN = 1; fake += 5000; md.room.onMessage(q.id, { t: 'g' }); run(md.room, 3); assert.equal(q.hp, 100, 'never above full');
  performance.now = realNow;
  console.log('ok  equipment: frag, cover, own team, own grenade, limits, smoke, med kit');
}

// 8) Stances and the newer bombs
{
  const realNow = performance.now.bind(performance);
  let fake = realNow();
  performance.now = () => fake;
  const run = (room, sec) => { for (let i = 0; i < sec * 30; i++) { fake += 1000 / 30; room.update(1 / 30); } };
  const make = (n, eq) => { const room = new Room({ minPlayers: 0 }), P = []; for (let i = 0; i < n; i++) { const p = { got: [] }; p.s = room.players.get(room.addPlayer('P' + i, 'rifle', m => p.got.push(m), undefined, null, { eq })); P.push(p); } return { room, P }; };
  const put = (p, x, z, yaw = 0) => Object.assign(p.s, { x, y: 0, z, yaw, pitch: 0, cr: 0, crT: 0, prot: 0 });
  const tell = (room, p, o) => { fake += 200; room.onMessage(p.s.id, { t: 'in', sp: p.s.sp, x: p.s.x, y: p.s.y, z: p.s.z, yaw: p.s.yaw, pitch: 0, cr: 0, ...o }); };
  // hit areas: a level shot at standing eye height misses someone lying or kneeling; lying bodies stretch along their yaw
  const ray = (o, d, q) => hitbox(o, d, { x: 0, y: 0, z: 0, yaw: 0, ...q });
  assert.ok(ray([0, 1.6, 10], [0, 0, -1], { cr: 0 }).head); assert.equal(ray([0, 1.6, 10], [0, 0, -1], { cr: 1 }).t, Infinity); assert.equal(ray([0, 0.9, 10], [0, 0, -1], { cr: 2 }).t, Infinity);
  assert.ok(ray([0, 0.3, -10], [0, 0, 1], { cr: 2 }).head, 'lying head points forward');
  assert.ok(ray([5, 0.2, 0.6], [-1, 0, 0], { cr: 2 }).t < 6 && !ray([5, 0.2, 0.6], [-1, 0, 0], { cr: 2 }).head, 'legs lie behind');
  assert.equal(ray([5, 0.2, 0.6], [-1, 0, 0], { cr: 2, yaw: Math.PI / 2 }).t, Infinity, 'and turn with the body');
  // the server takes three stances and stops flickering
  const st = make(2, 'frag'), [A, B] = st.P; put(A, 0, 34); put(B, 0, 26, 0);
  tell(st.room, A, { cr: 2 }); assert.equal(A.s.cr, 2); tell(st.room, A, { cr: 1 }); assert.equal(A.s.cr, 1);
  st.room.onMessage(A.s.id, { t: 'in', sp: A.s.sp, x: 0, y: 0, z: 34, yaw: 0, pitch: 0, cr: 0 }); assert.equal(A.s.cr, 1, 'too soon');
  for (const bad of [7, 'x', {}, true]) { tell(st.room, A, { cr: bad }); assert.equal(A.s.cr, 1); }
  tell(st.room, A, {}); assert.equal(A.s.cr, 0);
  A.s.next = 0; B.s.hp = 100; tell(st.room, B, { cr: 2 }); run(st.room, 0.5);
  st.room.fire(A.s, 0, 0); assert.equal(B.s.hp, 100, 'over the head'); A.s.next = 0;
  st.room.fire(A.s, 0, Math.atan2(0.25 - 1.6, 8)); assert.ok(B.s.hp < 100, 'aimed down it hits');
  const snap = A.got.filter(m => m.t === 's').at(-1); assert.equal(snap.ps.find(x => x[0] === B.s.id)[6], 2, 'everyone sees the stance');
  // standing up needs room
  const roof = [{ min: [-2, 1, -2], max: [2, 1.4, 2] }];
  assert.equal(fitStance({ x: 0, y: 0, z: 0, cr: 2 }, 0, roof), 2); assert.equal(fitStance({ x: 0, y: 0, z: 0, cr: 2 }, 0, []), 0); assert.equal(fitStance({ x: 0, y: 0, z: 0, cr: 0 }, 2, roof), 2);
  assert.ok(stanceH(0) > stanceH(1) && stanceH(1) > stanceH(2));

  const throwAt = (room, p, x, y, z) => { room.onMessage(p.s.id, { t: 'g', yaw: 0, pitch: 0 }); const n = room.nades.at(-1); Object.assign(n, { x, y, z, vx: 0, vy: 0, vz: 0 }); return n; };
  // flash: only those who can see it, stronger when looking at it, never your team
  { const { room, P: [a, b, c, d] } = make(4, 'flash'); put(a, 0, 37, Math.PI); put(b, 0, 24, Math.PI); put(c, 1, 24, Math.PI); put(d, 0, 24.5, 0);   // b looks at +z, d looks away
    throwAt(room, a, 0, 0.5, 28); run(room, 1.5);
    const blind = p => p.got.find(m => m.t === 'fl')?.s || 0;
    assert.ok(blind(b) > 1.3 && blind(d) > 0 && blind(d) < blind(b) * 0.6, 'facing it is worse'); assert.equal(blind(c), 0, 'teammates are safe'); assert.equal(b.s.hp, 100); }
  { const { room, P: [a, b] } = make(2, 'flash'); put(a, 4, 2); put(b, 4, -9, Math.PI); throwAt(room, a, 4, 0.5, -3); run(room, 1.5); assert.ok(!b.got.some(m => m.t === 'fl'), 'walls block it'); }
  // fire: bursts on contact, burns only inside, stops, and late joiners see it
  { const { room, P: [a, b, c, d] } = make(4, 'fire'); put(a, 0, 36); put(b, 0, 28); put(c, 0.5, 27); put(d, 0, 10);
    throwAt(room, a, 0, 1.2, 27); run(room, 0.8);
    assert.equal(room.fires.length, 1); assert.ok(Math.abs(room.fires[0].y) < 0.05, 'on the floor');
    run(room, 2); assert.ok(b.s.hp < 80 && b.s.hp > 20, 'burns over time: ' + b.s.hp); assert.equal(c.s.hp, 100); assert.equal(d.s.hp, 100); assert.equal(a.s.hp, 100);
    const late = []; room.addPlayer('Late', 'rifle', m => late.push(m)); assert.ok(late.some(m => m.t === 'gx' && m.w === 'fire' && m.d > 3));
    b.s.hp = 10; run(room, 1.1); assert.ok(!b.s.alive && a.s.k === 1); assert.ok(a.got.some(m => m.t === 'k' && m.w === 'fire'));
    run(room, 5); assert.equal(room.fires.length, 0, 'burns out'); }
  // charge: sticks, blows on the second press, can be shot, dies with its owner
  { const { room, P: [a, b] } = make(2, 'charge'); put(a, 0, 36); put(b, 0, 25);
    const n = throwAt(room, a, 0, 0.4, 27); run(room, 1); assert.ok(n.stuck && b.got.some(m => m.t === 'gs'));
    const at = [n.x, n.y, n.z]; run(room, 3); assert.deepEqual([n.x, n.y, n.z], at, 'stays put'); assert.equal(b.s.hp, 100); assert.equal(a.s.eqN, 1);
    room.onMessage(a.s.id, { t: 'g' }); assert.ok(b.s.hp < 100 || !b.s.alive, 'blown'); assert.equal(room.nades.length, 0); assert.equal(a.s.eqN, 1, 'blowing costs nothing');
    room.spawn(b.s); put(b, 0, 31); run(room, 2.2); put(b, 0, 31); const m = throwAt(room, a, 0, 0.4, 27); run(room, 1); assert.ok(m.stuck);
    b.s.next = 0; b.s.yaw = 0; b.s.prot = 0; room.fire(b.s, 0, Math.atan2(m.y - 1.6, 4)); assert.equal(room.nades.length, 0, 'shot'); assert.ok(b.got.some(x => x.t === 'gx' && x.w === 'fizz')); }
  { const { room, P: [a, b] } = make(2, 'charge'); put(a, 0, 36); put(b, 0, 25); throwAt(room, a, 0, 0.4, 27); run(room, 1);
    room.onMessage(b.s.id, { t: 'g' }); assert.ok(!room.nades[0] || room.nades[0].by === a.s.id, 'others cannot blow it'); room.nades = room.nades.filter(x => x.by === a.s.id);
    room.kill(a.s, b.s, false); assert.equal(room.nades.length, 0, 'gone with its owner');
    throwAt(room, b, 0, 0.4, 10); run(room, 1); room.removePlayer(b.s.id); assert.equal(room.nades.length, 0); run(room, 1); }
  // resets clean everything
  { const { room, P: [a, b] } = make(2, 'fire'); put(a, 0, 34); put(b, 0, 10); throwAt(room, a, 0, 0.5, 20); run(room, 1); room.endMatch(); assert.equal(room.fires.length + room.nades.length, 0); }
  // bots throw, kneel and stay blind while dazzled
  { const room = new Room({ minPlayers: 8, killLimit: 999 }); room.addPlayer('W', 'rifle', () => {}); const W = room.players.get(1); Object.assign(W, { x: 39, z: 0 });
    let thrown = 0, knelt = 0; const old = room.useEquip.bind(room); room.useEquip = (p, y, q) => { const n = p.eqN; old(p, y, q); if (p.bot && p.eqN < n) thrown++; };
    for (let i = 0; i < 30 * 240; i++) { fake += 1000 / 30; room.update(1 / 30); W.prot = 99; W.hp = 100; for (const p of room.players.values()) if (p.bot && p.cr === 1) knelt++; }
    assert.ok(thrown > 2 && knelt > 30, `bots threw ${thrown} and knelt ${knelt} ticks`);
    const b = [...room.players.values()].find(p => p.bot && p.alive); if (b) { b.ai.blind = 2; b.ai.target = 1; room.bot(b, 1 / 30); assert.equal(b.ai.target, 0); } }
  performance.now = realNow;
  console.log('ok  stances, flash, fire, remote charge, bots kneel and throw');
}

// 8b) Leaning on walls
{
  const realNow = performance.now.bind(performance);
  let fake = realNow();
  performance.now = () => fake;
  const wall = [{ min: [-2, 0, -1], max: [2, 3, 0] }], low = [{ min: [-2, 0, -1], max: [2, 1.2, 0] }], curb = [{ min: [-2, 0, -1], max: [2, 0.4, 0] }];
  const at = (x, o) => ({ x, y: 0, z: 0.36, yaw: 0, cr: 0, wl: 4, pk: 0, ...o });
  // which walls count
  assert.equal(findWall(at(0), wall), 4); assert.equal(findWall(at(0, { z: 0.8 }), wall), 4); assert.equal(findWall(at(0, { z: 2 }), wall), 0, 'too far'); assert.equal(findWall(at(0), curb), 0, 'too low'); assert.equal(findWall(at(2.2), wall), 0, 'past the end');
  assert.ok(!lowWall(at(0), 4, wall) && lowWall(at(0), 4, low)); assert.ok(wallAt(at(1.7), 4, wall, 0.35, 0.2) && !wallAt(at(1.7), 4, wall, 0.35, 0.4));
  // the head goes to the right of someone who faces the wall, and not through things
  assert.ok(eyeOf(at(0, { pk: 1 }))[0] > 0.5 && eyeOf(at(0, { pk: -1 }))[0] < -0.5);
  assert.equal(peekRoom(at(0), 4, 1, wall), 1); assert.ok(peekRoom(at(0), 4, 1, [...wall, { min: [0.6, 0, 0], max: [1, 3, 2] }]) < 0.7); assert.equal(peekRoom(at(0), 4, 1, [...wall, { min: [0.36, 0, 0], max: [1, 3, 2] }]) > 0.2, false);
  // only head and chest show past the corner; kneeling behind a low wall shows nothing
  const shot = (s, x, y) => Math.min(hitbox([x, y, -10], [0, 0, 1], s).t, 1e9) < rayMap([x, y, -10], [0, 0, 1], wall);
  assert.ok(shot(at(1.66, { pk: 1 }), 2.26, 1.5), 'the head shows'); assert.ok(!shot(at(1.66, { pk: 1 }), 2.26, 0.5), 'the legs do not'); assert.ok(!shot(at(1.66), 2.1, 1.5), 'tucked in');
  assert.ok(hitbox([0, 1, 10], [0, 0, -1], at(0, { wl: 0, cr: 1 })).t < 99); assert.equal(hitbox([0, 1, 10], [0, 0, -1], at(0, { cr: 1 })).t, Infinity, 'head down');
  assert.equal(hitbox([10, 1.2, 0.62], [-1, 0, 0], at(0)).t, Infinity, 'flat against the wall');
  // the server believes it only beside a wall
  const room = new Room({ minPlayers: 0 }), got = [];
  const p = room.players.get(room.addPlayer('A', 'rifle', m => got.push(m)));
  const tell = o => { fake += 200; room.onMessage(p.id, { t: 'in', sp: p.sp, x: p.x, y: 0, z: p.z, yaw: p.yaw, pitch: 0, cr: 0, ...o }); };
  Object.assign(p, { x: -7.1, z: 34, y: 0 }); tell({ wl: 4, pk: 1 }); assert.equal(p.wl, 0); assert.equal(p.pk, 0);
  Object.assign(p, { x: 6.5, y: 0, z: 5.56 }); tell({ wl: 4, pk: 1 }); assert.equal(p.wl, 4); assert.equal(p.pk, 1);
  const e = eyeOf(p); p.next = 0; room.fire(p, p.yaw, 0);
  room.snapshot(fake / 1000); assert.deepEqual(got.filter(m => m.t === 's').at(-1).ps[0].slice(10), [4, 1], 'everyone sees it'); assert.ok(e[0] > 7);
  for (const bad of [9, 'x', {}, -1, 1.5, true]) { tell({ wl: bad, pk: 1 }); assert.equal(p.wl, 0); }
  for (const bad of ['x', {}, NaN, null]) { tell({ wl: 4, pk: bad }); assert.equal(p.wl, 4); assert.equal(p.pk, 0); }
  tell({ wl: 4, pk: 99 }); assert.equal(p.pk, 1); tell({ wl: 4, cr: 2 }); assert.equal(p.wl, 0, 'not while lying');
  // shots leave from the leaning head, and come back to it
  const f = room.players.get(room.addPlayer('B', 'rifle', () => {}));
  const duel = (by, to, yaw) => { Object.assign(p, { x: 6.86, y: 0, z: 5.56, cr: 0, hp: 100, prot: 0, hist: [], next: 0, yaw: 0 }); Object.assign(f, { x: 7.46, y: 0, z: -4, cr: 0, hp: 100, prot: 0, hist: [], next: 0, yaw: Math.PI }); room.fire(by, yaw, 0); return 100 - to.hp; };
  tell({ wl: 4, pk: 0 }); Object.assign(p, { x: 6.86, z: 5.56, wl: 4, pk: 0 });
  assert.equal(duel(p, f, 0), 0, 'the wall is in the way'); assert.equal(duel(f, p, Math.PI), 0, 'and protects');
  p.pk = 1; assert.ok(duel(p, f, 0) > 0, 'around the corner'); assert.ok(duel(f, p, Math.PI) > 0, 'a head that looks out can be hit');
  performance.now = realNow;
  console.log('ok  leaning on walls: where, corner, low wall, hit areas, server checks');
}

// 9) Real server: two clients join, receive snapshots, see each other in the roster
{
  const port = 3999;
  const sb = http.createServer((q, r) => { const ok = q.headers.authorization === 'Bearer a.b.owner'; r.writeHead(ok ? 200 : 401); r.end(ok ? '[{"product_id":"land:palace"},{"product_id":"weapon:dmr"}]' : '{}'); }).listen(3998);
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), MIN_PLAYERS: '6', SUPABASE_URL: 'http://localhost:3998', SUPABASE_KEY: 'test' }, stdio: 'pipe' });
  await sleep(700);
  const join = (name, map, token, lo = 'rifle') => new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const got = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, lo, map, token })));
    ws.on('message', d => got.push(JSON.parse(d)));
    ws.on('error', rej);
    setTimeout(() => res({ ws, got }), 1200);
  });
  const joinVoice = name => new Promise((res, rej) => {
    const c = { ws: new WebSocket(`ws://localhost:${port}/ws`), bin: [] };
    c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'join', name, lo: 'rifle', map: 'ruins' })));
    c.ws.on('message', (d, binary) => { if (binary) { c.bin.push(d); return; } const m = JSON.parse(d); if (m.t === 'welcome') { c.id = m.id; c.team = m.team; } });
    c.ws.on('error', rej);
    setTimeout(() => res(c), 800);
  });
  try {
    const [c1, c2] = await Promise.all([join('One'), join('Two')]);
    for (const c of [c1, c2]) {
      assert.ok(c.got.find(m => m.t === 'welcome'), 'welcome received');
      const snaps = c.got.filter(m => m.t === 's');
      assert.ok(snaps.length >= 10, `snapshots streaming (${snaps.length})`);
      assert.equal(snaps.at(-1).ps.length, 6, 'room has 6 players (2 humans + 4 bots)');
    }
    const ro = c2.got.filter(m => m.t === 'ro').at(-1);
    assert.ok(ro.ps.some(p => p.n === 'One') && ro.ps.some(p => p.n === 'Two'));
    const status = await (await fetch(`http://localhost:${port}/status`)).json();
    assert.equal(status.rooms[0].humans, 2);
    for (const f of ['character.html', 'character.js', 'shared/gear.js', 'soldier.js', 'cityscape.js', 'shared/cities.js', 'shared/landkit.js', 'models.js', 'arsenal.js', 'studio.js', 'profile.js']) assert.equal((await fetch(`http://localhost:${port}/${f}`)).status, 200, f);
    const html = await (await fetch(`http://localhost:${port}/`)).text();
    assert.ok(html.includes('client.js'), 'client page served');
    // land choice: own room per land, 'any' joins the busiest room, bad or missing values get the default land
    const land = c => c.got.find(m => m.t === 'welcome').map;
    assert.equal(land(c1), 'compound');
    const extra = await Promise.all([join('Three', 'frost'), join('Four', 'any'), join('Five', '__proto__')]);
    assert.deepEqual(extra.map(land), ['frost', 'compound', 'compound']);
    const after = await (await fetch(`http://localhost:${port}/status`)).json();
    assert.deepEqual(after.rooms.map(r => [r.map, r.humans]), [['compound', 4], ['frost', 1]]);
    // paid land and weapon: only for the owner, decided on the server
    const [own, guest, forged, gun] = await Promise.all([join('Own', 'palace', 'a.b.owner', 'dmr'), join('Guest', 'palace', undefined, 'dmr'), join('Forged', 'palace', 'a.b.forged'), join('Gun', 'harbor', undefined, 'dmr')]);
    const w = own.got.find(m => m.t === 'welcome');
    assert.deepEqual([w.map, w.lo], ['palace', 'dmr']);
    assert.deepEqual(guest.got, [{ t: 'deny', why: 'land' }]);
    assert.deepEqual(forged.got, [{ t: 'deny', why: 'check' }]);
    assert.equal(gun.got.find(m => m.t === 'welcome').lo, 'rifle');
    for (let i = 0; i < 3; i++) assert.notEqual(land(await join('Any' + i, 'any')), 'palace', 'any never opens a locked land');
    // a real city online: both clients and the server agree on every wall, so walking is never corrected and walls cannot be entered
    {
      const [g1, g2] = await Promise.all([join('City1', 'gangnam'), join('City2', 'gangnam')]), city = addCity(JSON.parse(fs.readFileSync(new URL('../public/maps/gangnam.json', import.meta.url), 'utf8')));
      assert.deepEqual([g1, g2].map(land), ['gangnam', 'gangnam']);
      const me = g1.got.find(m => m.t === 'welcome').id, p = { ...g1.got.filter(m => m.t === 'tp').at(-1), vx: 0, vy: 0, vz: 0, ground: true, cr: 0 }, tps = () => g1.got.filter(m => m.t === 'tp').length, before = tps();
      const from = [p.x, p.z];
      for (let i = 0; i < 40; i++) {   // two seconds of walking towards the middle, with the same code the browser runs
        for (let k = 0; k < 3; k++) step(p, -Math.sin(p.yaw), -Math.cos(p.yaw), PHYS.walk, 1 / 60, city.boxes);
        g1.ws.send(JSON.stringify({ t: 'in', sp: p.sp, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0, cr: 0 }));
        await sleep(50);
      }
      await sleep(150);
      const dead = g1.got.filter(m => m.t === 's').some(m => !m.me.al);
      if (!dead) {
        assert.equal(tps(), before, 'the server never moved the player back');
        const seen = g2.got.filter(m => m.t === 's').at(-1).ps.find(q => q[0] === me);
        assert.ok(Math.hypot(seen[1] - p.x, seen[3] - p.z) < 0.02, 'the other player sees the same place');
        assert.ok(Math.hypot(p.x - from[0], p.z - from[1]) > 3, 'it did move');
        const wall = city.boxes.filter(b => b.kind === 'building').sort((a, b) => Math.hypot((a.min[0] + a.max[0]) / 2 - p.x, (a.min[2] + a.max[2]) / 2 - p.z) - Math.hypot((b.min[0] + b.max[0]) / 2 - p.x, (b.min[2] + b.max[2]) / 2 - p.z))[0];
        g1.ws.send(JSON.stringify({ t: 'in', sp: p.sp, x: (wall.min[0] + wall.max[0]) / 2, y: 0, z: (wall.min[2] + wall.max[2]) / 2, yaw: 0, pitch: 0, cr: 0 }));
        await sleep(150);
        assert.equal(tps(), before + 1, 'no walking into a building');
      }
      const zipped = await fetch(`http://localhost:${port}/maps/gangnam.json`);
      assert.equal(zipped.headers.get('content-encoding'), 'gzip'); assert.equal((await zipped.json()).id, 'gangnam');
      g1.ws.close(); g2.ws.close();
      console.log('ok  city online: same walls on both sides' + (dead ? ' (walker was shot, walking checks skipped)' : ''));
    }
    // voice over the real connection: only the teammate hears it
    const four = await Promise.all(['V1', 'V2', 'V3', 'V4', 'V5', 'V6'].map(n => joinVoice(n)));
    const me = four[0], mates = four.filter(c => c !== me && c.team === me.team), foes = four.filter(c => c.team !== me.team);
    assert.ok(mates.length && foes.length);
    me.ws.send(new Uint8Array(PACKET).fill(3)); me.ws.send(new Uint8Array(10));
    await sleep(300);
    for (const c of mates) assert.deepEqual(c.bin.map(b => [b.length, b.readUInt32LE(0)]), [[4 + PACKET, me.id]]);
    for (const c of [me, ...foes]) assert.equal(c.bin.length, 0);
    for (const c of four) c.ws.close();
    // malformed messages must not stop the server
    { const early = new WebSocket(`ws://localhost:${port}/ws`); await new Promise(r => early.on('open', r)); early.send(new Uint8Array(PACKET)); early.send(new Uint8Array(3)); await sleep(50); early.close(); }
    gun.ws.send('{"t":"f","yaw":{"valueOf":1,"toString":1}}'); gun.ws.send('null'); gun.ws.send('[]');
    const odd = await join({ toString: 1 }, 'frost');
    assert.ok(odd.got.find(m => m.t === 'welcome'), 'odd name accepted as default');
    assert.equal(await (await fetch(`http://localhost:${port}/healthz`)).text(), 'ok');
    for (const c of [c1, c2, ...extra, own, gun, odd]) c.ws.close();
    console.log('ok  server: join, snapshots, roster, status, static files, land choice, paid land and weapon checks, voice relay, bad messages');
  } finally {
    srv.kill();
    sb.close(); sb.closeAllConnections();
  }
}
// Generated cities: complete, small, credited, and nothing but invented shop names
for (const file of fs.readdirSync(new URL('../public/maps/', import.meta.url))) {
  const text = fs.readFileSync(new URL('../public/maps/' + file, import.meta.url)), c = JSON.parse(text);
  assert.ok(zlib.gzipSync(text).length < 5 * 1024 * 1024, file + ': under 5 MB');
  assert.equal(c.source.attribution, '© OpenStreetMap contributors');
  assert.ok(c.buildings.length > 50 && c.roads.length > 20 && c.play > 0, file + ': has a city in it');
  for (const b of c.buildings) {
    assert.ok(b.p.length >= 6 && b.p.length % 2 === 0 && b.p.every(Number.isInteger) && b.h > (b.b || 0) && b.n >= 1 && [0, 1, 2, 3].includes(b.f), file + ': building');
    assert.ok(area(ring(b.p, c.unit)) > 0, file + ': outline direction');
  }
  const signs = readShopWords();
  for (const [cat, name] of c.shopNames) assert.ok(signs[cat].words.some(w => name.startsWith(w + ' ')), file + ': invented name ' + name);
  for (const [x, z, , w, cat, name] of c.shops) {
    assert.ok(w >= 20 && c.shopNames[name][0] === cat, file + ': shop');
    const d = Math.min(...c.buildings.map(b => ring(b.p, 1)).flatMap(p => p.map((a, i) => wallDist(x, z, a, p[(i + 1) % p.length]))));
    assert.ok(d < 2, file + ': shop stands on a wall');
  }
  console.log(`ok  city ${file}: ${c.buildings.length} buildings, ${c.shops.length} shops, ${c.roads.length} roads`);
}
// The fighting area of each real city: walls where the buildings are, open and connected, fair spawns, bots meet
for (const { id } of REAL) {
  assert.ok(!isReady(id) || getMap(id).city); assert.ok(MAP_LIST.some(m => m.id === id && m.real));
  if (!isReady(id)) assert.equal(getMap(id).spawns.red.length, 0, 'only a plan before it is loaded');
  const data = JSON.parse(fs.readFileSync(new URL('../public/maps/' + id + '.json', import.meta.url))), map = addCity(data), H = map.size[0], flat = [...map.boxes];
  assert.ok(isReady(id) && getMap(id) === map);
  // the cells give the same answers as testing every box
  const { points, main } = map.nav;
  for (let i = 0; i < 3000; i++) {
    const p = points[i % points.length], o = [p[0] + Math.sin(i) * 1.5, (i % 7) * 0.5 + 0.1, p[1] + Math.cos(i * 1.7) * 1.5], a = i * 0.77, e = Math.sin(i * 0.31) * 0.5, d = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
    assert.ok(Math.abs(rayMap(o, d, flat, 200) - rayMap(o, d, map.boxes, 200)) < 1e-6); assert.equal(!!hits(...o, 1.75, flat), !!hits(...o, 1.75, map.boxes));
  }
  for (const d of [[0, 0, -1], [1, 0, 0], [0, -1, 0]]) assert.ok(Math.abs(rayMap([0.5, 1, 0.5], d, flat) - rayMap([0.5, 1, 0.5], d, map.boxes)) < 1e-6, 'straight rays');
  // collision follows the drawn outlines
  const inside = (x, z, p) => { let r = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) r = !r; return r; };
  const outlines = data.buildings.filter(b => !b.b).map(b => ({ p: ring(b.p, data.unit), o: (b.o || []).map(h => ring(h, data.unit)) })), near = (x, z) => outlines.some(({ p, o }) => [p, ...o].some(r => r.some((a, i) => wallDist(x, z, a, r[(i + 1) % r.length]) < 0.45)));
  let n = 0;
  for (let x = -H + 1; x < H - 1; x += 1.7) for (let z = -H + 1; z < H - 1; z += 1.7) {
    const drawn = outlines.some(({ p, o }) => inside(x, z, p) && !o.some(h => inside(x, z, h))), solid = map.boxes.some(b => b.kind === 'building' && !b.min[1] && x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]);
    if (drawn !== solid && !near(x, z)) n++;
  }
  assert.equal(n, 0, id + ': walls are where the buildings are');
  // nobody gets out
  for (let a = 0; a < 360; a += 1) { const t = rayMap([points[main[0]][0], 1, points[main[0]][1]], [Math.cos(a), 0, Math.sin(a)], map.boxes, 400); assert.ok(t < H * 3, id + ': closed at ' + a); }
  assert.ok(points.every(([x, z]) => Math.abs(x) < H && Math.abs(z) < H));
  assert.ok(main.length > points.length * 0.9, id + ': floor is connected');
  for (const t of ['red', 'blue']) {
    assert.ok(map.spawns[t].length >= 7);
    for (const [x, z, yaw] of map.spawns[t]) { assert.ok(!hits(x, 0, z, PHYS.h, map.boxes), id + ': spawn is open'); assert.ok(Math.cos(yaw - Math.atan2(x, z)) > 0.9, 'faces the middle'); }
  }
  for (const a of map.spawns.red) for (const b of map.spawns.blue) { const d = [b[0] - a[0], 0, b[1] - a[1]], L = Math.hypot(...d); assert.ok(rayMap([a[0], 1.6, a[1]], d.map(v => v / L), map.boxes, L) < L - 0.2, id + ': spawns cannot see each other'); }
  const room = new Room({ minPlayers: 12, map: id, killLimit: 999 }), realNow = performance.now.bind(performance);
  room.addPlayer('Watcher', 'rifle', () => {});
  const W = room.players.get(1);
  let fake = realNow(), slow = 0, legs = 0;
  const from = new Map();
  performance.now = () => fake;
  for (let i = 0; i < 30 * 240; i++) {
    fake += 1000 / 30; room.update(1 / 30); W.prot = 99; W.hp = 100;
    if (i % 60) continue;
    for (const p of room.players.values()) { const tag = p.alive && !p.ai?.target ? p.sp : -1, f = from.get(p.id); if (p.bot && f && tag >= 0 && f.tag === tag) { legs++; if (Math.hypot(p.x - f.x, p.z - f.z) < 1) slow++; } from.set(p.id, { x: p.x, z: p.z, tag }); }
  }
  performance.now = realNow;
  const { red, blue } = room.score;
  assert.ok(red + blue > 15, id + ': the teams meet'); assert.ok(slow < legs * 0.15, id + ': bots are not stuck');
  console.log(`ok  city ${id}: ${map.boxes.length} boxes, ${red + blue} bot kills in 4 simulated minutes (red ${red} / blue ${blue}), stuck ${slow}/${legs}`);
}
assert.ok(MAP_IDS.includes(randomMap()) || REAL.some(c => c.id === randomMap()));
function readShopWords() { return JSON.parse(fs.readFileSync(new URL('../tools/osm/shops.json', import.meta.url))).categories; }
function wallDist(x, z, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * k, z - a[1] - dz * k); }

// Battle voices: every file is there and every line is inside its file
{
  const { VOICES, LINES } = await import('../public/voicelines.js'), { clampVolume } = await import('../public/battle.js');
  const bytes = VOICES.map(v => fs.statSync(new URL('../public/' + v.file, import.meta.url)).size);
  assert.ok(bytes.reduce((a, b) => a + b) < 1.2e6, 'voices stay a small download');
  for (const kind of ['reload', 'frag', 'grenade', 'contact', 'kill', 'mandown', 'start', 'order', 'hurt', 'death']) VOICES.forEach((v, i) => assert.ok(v.extra || LINES[kind].some(l => l[0] === i), v.file + ': ' + kind));
  for (const kind of ['radio', 'radiokill', 'radiolost', 'far']) assert.ok(LINES[kind].length >= 2, kind);
  for (const kind in LINES) for (const [v, at, len] of LINES[kind]) assert.ok(len > 0.2 && len < 3.2 && at >= 0 && at + len < bytes[v] * 8 / 48000 + 0.05, kind + ' is inside ' + VOICES[v].file);   // 48 kbit/s
  assert.deepEqual([null, '', 'x', '0', '0.35', 7, -1].map(clampVolume), [0.7, 0.7, 0.7, 0, 0.35, 1, 0]);
  console.log('ok  battle voices: ' + VOICES.length + ' files, ' + Object.values(LINES).flat().length + ' lines, ' + Math.round(bytes.reduce((a, b) => a + b) / 1024) + ' KB');
}

console.log('all smoke tests passed');
