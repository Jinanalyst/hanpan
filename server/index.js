// HANPAN game server: serves the client and runs authoritative match rooms over WebSocket.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from '../public/shared/game.js';
import { isMap, isReady, canPlay, randomMap, addCity, getMap, MAP_LIST, DEFAULT_MAP } from '../public/shared/map.js';
import { REAL } from '../public/shared/realcities.js';
import { ownedBy } from './owned.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
// Some hosts (Hostinger, LiteSpeed, Passenger) pass a socket path instead of a number, so keep it as-is.
const PORT = process.env.PORT || 3000;
const MAX_PER_ROOM = +process.env.MAX_PER_ROOM || 12;   // humans per room
const MIN_PLAYERS = +process.env.MIN_PLAYERS || 6;      // bots fill rooms up to this size
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
};

// Real city lands: a missing or broken file only takes that land away.
for (const { id } of REAL) {
  try { addCity(JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', id + '.json'), 'utf8'))).nav; } catch (e) { console.error('[hanpan] land ' + id + ' is not available:', e.message); }
}

const rooms = [];
let roomSeq = 1;

// Private fights: a hard-to-guess code is the key. Only people given the link can join, and the room
// never shows up in matchmaking. A code lasts FIGHT_LIFE after it was made or last played.
const fights = new Map();   // code -> { n, map, at, room }
const FIGHT_LIFE = 3 * 3600e3, MAX_FIGHTS = 500, FIGHT_KILLS = { 1: 10, 2: 15, 5: 20 };
const fightLands = () => MAP_LIST.filter(m => !m.product && isReady(m.id)).map(m => ({ id: m.id, name: m.name, city: !!m.city }));   // free lands, so everyone invited can play
const made = new Map();     // address -> fights made in the last minute
setInterval(() => {
  made.clear();
  const t = Date.now();
  for (const [code, f] of fights) if (!f.room && t - f.at > FIGHT_LIFE) fights.delete(code);
}, 60e3).unref();
const fightInfo = f => ({ n: f.n, map: f.map, land: getMap(f.map).name, players: f.room ? f.room.humanCount() : 0, playing: f.room?.phase === 'play' });

function readBody(req, max = 1024) {
  return new Promise((ok, no) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > max) { no(new Error('big')); req.destroy(); } });
    req.on('end', () => ok(b)); req.on('error', no);
  });
}
function json(res, code, v) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(v)); }

async function fightApi(req, res, url) {
  if (url === '/fight/lands' && req.method === 'GET') return json(res, 200, { lands: fightLands() });
  if (url === '/fight' && req.method === 'POST') {
    const o = req.headers.origin;
    if (o && o !== 'http://' + req.headers.host && o !== 'https://' + req.headers.host) return json(res, 403, { error: 'origin' });
    const ip = req.socket.remoteAddress || '';
    if ((made.get(ip) || 0) >= 6) return json(res, 429, { error: 'too_fast' });
    if (fights.size >= MAX_FIGHTS) return json(res, 503, { error: 'busy' });
    let m;
    try { m = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad' }); }
    const n = FIGHT_KILLS[m?.n] && Number.isInteger(m.n) ? m.n : 0, map = m?.map;
    if (!n || !fightLands().some(l => l.id === map)) return json(res, 400, { error: 'bad' });
    made.set(ip, (made.get(ip) || 0) + 1);
    let code;
    do code = [...crypto.randomBytes(10)].map(b => FIGHT_ABC[b % FIGHT_ABC.length]).join(''); while (fights.has(code));
    fights.set(code, { n, map, at: Date.now(), room: null });
    console.log(`[fight] made ${n}v${n} on ${map}`);
    return json(res, 200, { code, ...fightInfo(fights.get(code)) });
  }
  const g = /^\/fight\/([a-z0-9]{10})$/.exec(url);
  if (g && req.method === 'GET') { const f = fights.get(g[1]); return f ? json(res, 200, fightInfo(f)) : json(res, 404, { error: 'gone' }); }
  return json(res, 404, { error: 'not_found' });
}
const FIGHT_ABC = 'abcdefghijkmnpqrstuvwxyz23456789';   // 32 letters: no 0/o or 1/l mix-ups, ~50 bits per code

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  if (url === '/fight' || url.startsWith('/fight/')) { fightApi(req, res, url).catch(() => { if (!res.headersSent) json(res, 400, { error: 'bad' }); }); return; }
  if (url === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ rooms: rooms.map(r => ({ id: r.id, map: r.map.id, humans: r.humanCount(), bots: r.botCount(), phase: r.phase, score: r.score })) }));
    return;
  }
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const headers = { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
    if (path.extname(file) === '.mp3') headers['cache-control'] = 'public, max-age=86400';   // the voices are the biggest files here
    if (['login.html', 'servers.html'].includes(path.basename(file))) headers['x-frame-options'] = 'DENY';   // no hidden overlays on the wallet login or chat
    if (path.extname(file) === '.json' && data.length > 8192 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      headers['content-encoding'] = 'gzip'; headers.vary = 'accept-encoding';
      zlib.gzip(data, (e, z) => { if (e) { res.writeHead(500); res.end(); return; } res.writeHead(200, headers); res.end(z); });
      return;
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });

// Each room plays one land. 'any' joins the busiest open room on a land this player may use.
function pickRoom(want, owned) {
  const any = want === 'any';
  const map = isReady(want) ? want : any ? randomMap(owned) : DEFAULT_MAP;
  let r = rooms.filter(r => !r.fight && (any ? canPlay(r.map.id, owned) : r.map.id === map) && r.humanCount() < MAX_PER_ROOM)
    .sort((a, b) => b.humanCount() - a.humanCount())[0];
  if (!r) {
    r = new Room({ id: 'room-' + roomSeq++, map, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PER_ROOM });
    rooms.push(r);
  }
  return r;
}

wss.on('connection', ws => {
  let room = null, joining = false, id = 0, count = 0, windowStart = Date.now();
  ws.on('message', async (buf, binary) => {
    const t = Date.now();
    if (t - windowStart > 1000) { windowStart = t; count = 0; }
    if (++count > 150) { ws.close(1008, 'rate limit'); return; }   // ~20 inputs + ~12 shots + 25 voice packets per second is normal
    if (binary) { if (room && Buffer.isBuffer(buf)) room.voice(id, buf); return; }
    let m;
    try { m = JSON.parse(buf.toString()); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'join') {
      if (room || joining) return;
      joining = true;
      const found = m.token ? await ownedBy(m.token) : null, owned = found || new Set();
      joining = false;
      if (ws.readyState !== 1) return;                                     // left while we were checking
      const f = typeof m.fight === 'string' ? fights.get(m.fight) : null;
      if (m.fight && (!f || (f.room && f.room.humanCount() >= f.n * 2))) {   // gone, or both teams are full
        ws.send(JSON.stringify({ t: 'deny', why: f ? 'full' : 'fight' }));
        ws.close(1000);
        return;
      }
      if (f) {
        if (!f.room) { f.room = new Room({ id: 'fight-' + roomSeq++, map: f.map, fight: f.n, killLimit: FIGHT_KILLS[f.n] }); rooms.push(f.room); }
        room = f.room; f.at = Date.now();
      } else if (isMap(m.map) && !canPlay(m.map, owned)) {                        // paid land this player does not own
        ws.send(JSON.stringify({ t: 'deny', why: m.token && !found ? 'check' : 'land' }));
        ws.close(1000);
        return;
      }
      if (!room) room = pickRoom(m.map, owned);
      id = room.addPlayer(typeof m.name === 'string' ? m.name : '', m.lo, msg => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }, owned,
        packet => { if (ws.readyState === 1 && ws.bufferedAmount < 32768) ws.send(packet); }, { sa: m.sa, eq: m.eq, gear: m.gear });   // on a slow line voice is dropped before the game lags
      console.log(`[join] ${room.id} ${room.map.id} #${id} (${room.humanCount()} humans)`);
      return;
    }
    if (room) try { room.onMessage(id, m); } catch { ws.close(1008, 'bad message'); }   // one bad client must not stop the server
  });
  ws.on('close', () => {
    if (!room) return;
    room.removePlayer(id);
    if (room.humanCount() === 0) {
      rooms.splice(rooms.indexOf(room), 1);
      for (const f of fights.values()) if (f.room === room) { f.room = null; f.at = Date.now(); }   // the link keeps working for a while
    }
  });
});

let last = performance.now();
setInterval(() => {
  const t = performance.now(), dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  for (const r of rooms) r.update(dt);
}, 1000 / 30);

server.listen(PORT, () => console.log(`HANPAN server listening on http://localhost:${PORT}`));
