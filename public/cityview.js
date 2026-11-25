// Development page: look around a generated city and measure it. cityview.html?city=gangnam
// The renderer settings are the same as the game's, so the numbers carry over.
import * as THREE from 'three';
import { DAY } from './shared/osmgeo.js';
import { loadCity, buildCity, mainStreet, attribution } from './osmcity.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search), id = params.get('city') || 'gangnam';
const R = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
R.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
R.shadowMap.enabled = true;
R.shadowMap.type = THREE.PCFSoftShadowMap;
R.toneMapping = THREE.ACESFilmicToneMapping;
R.info.autoReset = false;   // reset by hand, so the shadow pass is counted too

const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(78, 1, 0.05, 1400);
cam.rotation.order = 'YXZ';
scene.background = new THREE.Color(DAY.sky);
scene.fog = new THREE.Fog(DAY.sky, ...DAY.fog);
scene.add(new THREE.HemisphereLight(...DAY.hemi));
const sun = new THREE.DirectionalLight(DAY.sun[0], DAY.sun[1]), SUN = new THREE.Vector3(...DAY.sun[2]), REACH = 90;
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -REACH, right: REACH, top: REACH, bottom: -REACH, near: 1, far: 420 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.08;
scene.add(sun, sun.target);

function resize() { R.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const data = await loadCity(id);
let guess = params.has('guess'), city = buildCity(data, { showGuess: guess });
scene.add(city.group);
document.body.append(attribution(data));
$('name').textContent = data.name;
$('panel').hidden = params.has('clean');
const street = mainStreet(data), size = data.radius || Math.hypot(...data.half);
{   // edge of the area
  const circle = r => Array.from({ length: 129 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI) * r, 0.12, Math.sin(i / 64 * Math.PI) * r));
  const [hx, hz] = data.half || [], t = data.turn * Math.PI / 180, turn = ([x, z]) => new THREE.Vector3(x * Math.cos(t) + z * Math.sin(t), 0.1, z * Math.cos(t) - x * Math.sin(t));
  const pts = data.radius ? circle(size) : [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [-hx, -hz]].map(turn);
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xc2410c })));
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circle(data.play)), new THREE.LineBasicMaterial({ color: 0x1d4ed8 })));   // where the match is played
}

/* ---- camera ---- */
let yaw = 0, pitch = 0;
const look = (x, y, z) => { const d = new THREE.Vector3(x, y, z).sub(cam.position); yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); };
const VIEW = {
  street() { cam.position.set(street.x, 1.6, street.z); look(street.x + street.dx * 50, 9, street.z + street.dz * 50); },
  bird() { cam.position.set(size * 0.6, size * 0.55, size * 0.7); look(0, 0, 0); },
  shops() {   // facing the busiest row of shops near the middle
    const U = data.unit, list = data.shops.map(s => ({ x: s[0] * U, z: s[1] * U, a: s[2] / 10 * Math.PI / 180 })).filter(s => Math.hypot(s.x, s.z) < data.play);
    let best = list[0], bn = -1;
    for (const s of list) { const n = list.filter(q => Math.hypot(q.x - s.x, q.z - s.z) < 22 && Math.abs(q.a - s.a) < 0.2).length; if (n > bn) { bn = n; best = s; } }
    cam.position.set(best.x + Math.sin(best.a) * 9 + Math.cos(best.a) * 7, 1.7, best.z + Math.cos(best.a) * 9 - Math.sin(best.a) * 7); look(best.x, 2.6, best.z);
  },
  alley() {   // the side street closest to the middle
    let best = null;
    for (const r of data.roads) if (r.k === 'residential' && r.w < 90) for (let i = 2; i < r.p.length; i += 2) {
      const a = [r.p[i - 2] * data.unit, r.p[i - 1] * data.unit], b = [r.p[i] * data.unit, r.p[i + 1] * data.unit], d = Math.hypot(a[0] + b[0], a[1] + b[1]) / 2;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 25 && (!best || d < best.d)) best = { d, a, b };
    }
    if (!best) return VIEW.street();
    const [a, b] = [best.a, best.b];
    cam.position.set(a[0] + (b[0] - a[0]) * 0.1, 1.6, a[1] + (b[1] - a[1]) * 0.1); look(b[0], 3, b[1]);
  },
  cross() { cam.position.set(street.x + street.dz * 14 - street.dx * 26, 14, street.z - street.dx * 14 - street.dz * 26); look(street.x + street.dx * 20, 0, street.z + street.dz * 20); },
  top() { cam.position.set(0, size * 1.6, 1); look(0, 0, 0); },
};
for (const k in VIEW) $(k).onclick = () => VIEW[k]();
$('guess').onclick = () => {
  guess = !guess;
  scene.remove(city.group); city.dispose();
  city = buildCity(data, { showGuess: guess }); scene.add(city.group);
  $('guess').setAttribute('aria-pressed', guess);
};
$('guess').setAttribute('aria-pressed', guess);
(VIEW[params.get('view')] || VIEW.street)();
const K = {};
addEventListener('keydown', e => { K[e.code] = true; }); addEventListener('keyup', e => { K[e.code] = false; }); addEventListener('blur', () => { for (const k in K) K[k] = false; });
let drag = false;
$('c').onpointerdown = e => { drag = true; $('c').setPointerCapture(e.pointerId); };
$('c').onpointerup = () => { drag = false; };
$('c').onpointermove = e => { if (drag) { yaw += e.movementX * 0.004; pitch = Math.max(-1.55, Math.min(1.55, pitch + e.movementY * 0.004)); } };

/* ---- frame ---- */
function draw() {
  cam.rotation.set(pitch, yaw, 0);
  // the shadows follow the camera in whole shadow pixels, so they do not shimmer
  const s = REACH * 2 / 2048 * 8, x = Math.round(cam.position.x / s) * s, z = Math.round(cam.position.z / s) * s;
  sun.target.position.set(x, 0, z); sun.position.set(x, 0, z).add(SUN);
  scene.fog.near = DAY.fog[0] + cam.position.y * 3; scene.fog.far = DAY.fog[1] + cam.position.y * 3;   // clear air when looking down from above
  R.info.reset();
  R.render(scene, cam);
}
const times = [];
let last = performance.now(), shown = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - last) / 1000); times.push(t - last); last = t;
  if (times.length > 240) times.shift();
  const v = (K.ShiftLeft ? 60 : 12) * dt, f = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), r = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
  cam.position.x += (-Math.sin(yaw) * f + Math.cos(yaw) * r) * v; cam.position.z += (-Math.cos(yaw) * f - Math.sin(yaw) * r) * v;
  cam.position.y = Math.max(0.5, cam.position.y + ((K.KeyE ? 1 : 0) - (K.KeyQ ? 1 : 0)) * v);
  if (running) return;
  draw();
  if (t - shown > 500) { shown = t; panel(); }
}
const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
function panel(extra = '') {
  const i = R.info.render, s = data.stats;
  $('stat').textContent = `fps      ${(1000 / avg(times.slice(-60))).toFixed(0)}\n드로우콜 ${i.calls} / 300\n삼각형   ${i.triangles.toLocaleString()}\n매장     ${city.stats.shops}\n건물     ${s.buildings} (인스턴스 ${city.stats.instanced}, 개별 ${city.stats.extruded})\n높이     실측 ${s.height}, 층수 ${s.levels}, 기본값 ${s.default}` + (extra || bench);
}

/* ---- measuring: a fixed tour, every frame finished on the GPU before the next one starts ---- */
let running = false, bench = '';
export async function measure() {
  running = true;
  const gl = R.getContext(), px = new Uint8Array(4), ms = [], calls = [], tris = [], N = 600, back = [cam.position.clone(), yaw, pitch];
  const go = k => {   // along the main street looking around, then a circle above the roofs
    if (k < 0.7) {
      const q = k / 0.7, s = (q - 0.5) * size * 1.5;
      cam.position.set(street.x + street.dx * s, 1.6, street.z + street.dz * s); yaw = q * Math.PI * 8; pitch = 0.06;
    } else {
      const a = (k - 0.7) / 0.3 * Math.PI * 2;
      cam.position.set(Math.cos(a) * size, 130, Math.sin(a) * size); look(0, 10, 0);
    }
  };
  for (let i = 0; i < 30; i++) { go(i / 30); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }   // warm up
  for (let i = 0; i < N; i++) {
    go(i / N);
    const t = performance.now();
    draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    ms.push(performance.now() - t); calls.push(R.info.render.calls); tris.push(R.info.render.triangles);
    if (i % 20 === 0) await new Promise(r => setTimeout(r));
  }
  [cam.position.x, cam.position.y, cam.position.z] = back[0].toArray(); yaw = back[1]; pitch = back[2];
  running = false;
  const st = [...ms].sort((a, b) => a - b), dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const out = {
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '', size: [R.domElement.width, R.domElement.height],
    frameMs: +avg(ms).toFixed(2), p99Ms: +st[Math.floor(N * 0.99)].toFixed(2), fpsAvg: Math.round(1000 / avg(ms)), fps1Low: Math.round(1000 / st[Math.floor(N * 0.99)]),
    callsAvg: Math.round(avg(calls)), callsMax: Math.max(...calls), trisMax: Math.max(...tris),
  };
  bench = `\n\n측정 ${out.size.join('x')}\n평균 ${out.fpsAvg} fps (${out.frameMs} ms)\n하위 1% ${out.fps1Low} fps (${out.p99Ms} ms)\n드로우콜 최대 ${out.callsMax}, 평균 ${out.callsAvg}`;
  panel();
  return out;
}
$('bench').onclick = () => measure();
window.cityview = { measure, VIEW, cam, data, get city() { return city; }, rafFps: () => 1000 / avg(times) };
requestAnimationFrame(t => { last = t; frame(t); });
