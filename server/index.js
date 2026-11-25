// HANPAN game server: serves the client and runs authoritative match rooms over WebSocket.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from '../public/shared/game.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
// Some hosts (Hostinger, LiteSpeed, Passenger) pass a socket path instead of a number, so keep it as-is.
const PORT = process.env.PORT || 3000;
const MAX_PER_ROOM = +process.env.MAX_PER_ROOM || 12;   // humans per room
const MIN_PLAYERS = +process.env.MIN_PLAYERS || 6;      // bots fill rooms up to this size
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const rooms = [];
let roomSeq = 1;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  if (url === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ rooms: rooms.map(r => ({ id: r.id, humans: r.humanCount(), bots: r.botCount(), phase: r.phase, score: r.score })) }));
    return;
  }
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

function pickRoom() {
  let r = rooms.find(r => r.humanCount() < MAX_PER_ROOM);
  if (!r) {
    r = new Room({ id: 'room-' + roomSeq++, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PER_ROOM });
    rooms.push(r);
  }
  return r;
}

wss.on('connection', ws => {
  let room = null, id = 0, count = 0, windowStart = Date.now();
  ws.on('message', buf => {
    const t = Date.now();
    if (t - windowStart > 1000) { windowStart = t; count = 0; }
    if (++count > 150) { ws.close(1008, 'rate limit'); return; }   // ~20 inputs + ~12 shots per second is normal
    let m;
    try { m = JSON.parse(buf.toString()); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'join') {
      if (room) return;
      room = pickRoom();
      id = room.addPlayer(m.name, m.lo, msg => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); });
      console.log(`[join] ${room.id} #${id} (${room.humanCount()} humans)`);
      return;
    }
    if (room) room.onMessage(id, m);
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
