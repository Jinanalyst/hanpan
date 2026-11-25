// HANPAN game server: serves the client and runs authoritative match rooms over WebSocket.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from '../public/shared/game.js';
import { isMap, isReady, canPlay, randomMap, addCity, DEFAULT_MAP } from '../public/shared/map.js';
import { REAL } from '../public/shared/realcities.js';
import { ownedBy } from './owned.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
// Some hosts (Hostinger, LiteSpeed, Passenger) pass a socket path instead of a number, so keep it as-is.
const PORT = process.env.PORT || 3000;
const MAX_PER_ROOM = +process.env.MAX_PER_ROOM || 12;   // humans per room
const MIN_PLAYERS = +process.env.MIN_PLAYERS || 6;      // bots fill rooms up to this size
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// Real city lands: a missing or broken file only takes that land away.
for (const { id } of REAL) {
  try { addCity(JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', id + '.json'), 'utf8'))).nav; } catch (e) { console.error('[hanpan] land ' + id + ' is not available:', e.message); }
}

const rooms = [];
let roomSeq = 1;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
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
  let r = rooms.filter(r => (any ? canPlay(r.map.id, owned) : r.map.id === map) && r.humanCount() < MAX_PER_ROOM)
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
      if (isMap(m.map) && !canPlay(m.map, owned)) {                        // paid land this player does not own
        ws.send(JSON.stringify({ t: 'deny', why: m.token && !found ? 'check' : 'land' }));
        ws.close(1000);
        return;
      }
      room = pickRoom(m.map, owned);
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
    if (room.humanCount() === 0) rooms.splice(rooms.indexOf(room), 1);
  });
});

let last = performance.now();
setInterval(() => {
  const t = performance.now(), dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  for (const r of rooms) r.update(dt);
}, 1000 / 30);

server.listen(PORT, () => console.log(`HANPAN server listening on http://localhost:${PORT}`));
