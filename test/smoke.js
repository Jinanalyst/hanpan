// Smoke tests: hit detection, bot matches, and a real WebSocket join against the server.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { Room, cleanChat } from '../public/shared/game.js';
import { encode, decode, FRAME, PACKET, RATE } from '../public/shared/adpcm.js';
import { getMap, MAP_IDS, MAP_LIST } from '../public/shared/map.js';
import { WEAPONS, damageAt } from '../public/shared/weapons.js';
import { hits, PHYS } from '../public/shared/physics.js';
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

// 3) Every land: symmetric, spawns open and connected, bots get around and score kills in two simulated minutes
for (const id of MAP_IDS) {
  const map = getMap(id);
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  for (const b of map.boxes) {
    assert.ok(map.boxes.some(c => c.kind === b.kind && near(c.min[1], b.min[1]) && near(c.max[1], b.max[1]) &&
      near(c.min[0], -b.max[0]) && near(c.max[0], -b.min[0]) && near(c.min[2], -b.max[2]) && near(c.max[2], -b.min[2])), `${id}: both halves match`);
  }
  const { points, main } = map.nav;
  assert.ok(main.length > points.length * 0.9, `${id}: floor is connected`);
  for (const [x, z] of [...map.spawns.red, ...map.spawns.blue]) {
    assert.ok(!hits(x, 0, z, PHYS.h, map.boxes), `${id}: spawn ${x},${z} is open`);
    assert.ok(main.some(k => Math.hypot(points[k][0] - x, points[k][1] - z) < 5), `${id}: spawn ${x},${z} is connected`);
  }
  const room = new Room({ minPlayers: 8, map: id });
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

// 6) Real server: two clients join, receive snapshots, see each other in the roster
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
console.log('all smoke tests passed');
