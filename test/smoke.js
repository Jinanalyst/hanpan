// Smoke tests: hit detection, bot matches, and a real WebSocket join against the server.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Room } from '../public/shared/game.js';
import { getMap, MAP_IDS } from '../public/shared/map.js';
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

// 4) Real server: two clients join, receive snapshots, see each other in the roster
{
  const port = 3999;
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), MIN_PLAYERS: '6' }, stdio: 'pipe' });
  await sleep(700);
  const join = (name, map) => new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const got = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, lo: 'rifle', map })));
    ws.on('message', d => got.push(JSON.parse(d)));
    ws.on('error', rej);
    setTimeout(() => res({ ws, got }), 1200);
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
    for (const c of [c1, c2, ...extra]) c.ws.close();
    console.log('ok  server: join, snapshots, roster, status, static files, land choice');
  } finally {
    srv.kill();
  }
}
console.log('all smoke tests passed');
