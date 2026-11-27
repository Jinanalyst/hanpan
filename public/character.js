// Character page: dress the soldier, choose weapons and equipment, keep three kits. Everything saves as you pick.
import * as THREE from 'three';
import { WEAPONS, EQUIP, PRIMARIES, SIDEARMS, damageAt } from './shared/weapons.js';
import { GEAR, SLOTS, itemsOf, cleanGear, randomGear, packGear } from './shared/gear.js';
import { cleanName } from './shared/game.js';
import { loadProfile, saveProfile, activeKit, loadName, saveName, loadRecord } from './profile.js';
import { makeSoldier, setWeapon, disposeSoldier, soldierReady } from './soldier.js';
import { buildGun, buildEquip } from './arsenal.js';
import { dispose } from './models.js';
import { snap, lightStage, VIEWS } from './studio.js';
import { configured, maybeSignedIn, ownedProducts } from './auth.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let profile = loadProfile(), owned = new Set(), team = 'red', slot = 'lo', sidearm = false;
const kit = () => activeKit(profile);
const locked = product => !!product && !owned.has(product);

/* ---- slots: weapons and equipment first, then the outfit ---- */
const LOAD = {
  lo: { name: 'Primary', view: 'gun', ids: PRIMARIES, of: id => WEAPONS[id], note: 'Every weapon is free to try in Practice. Locked ones need the Store to be used online.' },
  sa: { name: 'Sidearm', view: 'gun', ids: SIDEARMS, of: id => WEAPONS[id], note: 'Press 2 in a match to draw it.' },
  eq: { name: 'Equipment', view: 'full', ids: Object.keys(EQUIP), of: id => EQUIP[id], note: 'In a match, hold G to aim and release to throw. The med kit works with one press.' },
};
const GROUPS = [['Weapons', ['lo', 'sa', 'eq', 'finish']], ['Head', ['helmet', 'face', 'skin']], ['Body', ['camo', 'vest', 'pack', 'gloves', 'boots', 'extra']]];
const slotName = s => (LOAD[s] || GEAR[s]).name;
const current = s => (LOAD[s] ? kit()[s] : kit().gear[s]);
const itemName = (s, id) => (LOAD[s] ? LOAD[s].of(id).name : GEAR[s].items[id]);

/* ---- stage ---- */
const canvas = $('view');
const R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
R.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
R.toneMapping = THREE.ACESFilmicToneMapping;
R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50), key = lightStage(scene);
key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.5, bottom: -0.5, near: 0.5, far: 9 });
const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.02, 0.08, 48), new THREE.MeshStandardMaterial({ color: 0x2c311e, roughness: 0.9 }));
floor.position.y = -0.04; floor.receiveShadow = true; scene.add(floor);
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: 0xd8c9a3 }));
ring.rotation.x = Math.PI / 2; scene.add(ring);
let body = null, shown = '', turn = VIEWS.full[2], turnTo = turn, camY = VIEWS.full[0], camD = VIEWS.full[1], zoom = 1, view = 'full';

function dress() {
  const want = team + packGear(kit().gear), gun = sidearm ? kit().sa : kit().lo;
  if (want !== shown) {
    if (body) { scene.remove(body); disposeSoldier(body); }
    body = makeSoldier(team, kit().gear, gun);
    scene.add(body); shown = want;
  } else setWeapon(body, gun);
  ring.material.color.set(team === 'red' ? 0xd9452b : 0x2f7fd6);
}
function look(v) { view = v; turnTo = VIEWS[v][2]; while (turnTo - turn > Math.PI) turnTo -= Math.PI * 2; while (turnTo - turn < -Math.PI) turnTo += Math.PI * 2; zoom = 1; }
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000), w = canvas.clientWidth, h = canvas.clientHeight; last = now;
  if (!w || !h) return;
  const pr = R.getPixelRatio();
  if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) { R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  const k = calm ? 1 : 1 - Math.exp(-dt * 7), V = VIEWS[view];
  // narrow stages need more distance so the soldier is not cut off at the sides
  const fit = Math.max(1, 0.62 / cam.aspect);
  turn += (turnTo - turn) * k; camY += (V[0] - camY) * k; camD += (V[1] * fit * zoom * 1.12 - camD) * k;
  cam.position.set(0, camY + camD * 0.07, -camD); cam.lookAt(0, camY, 0);
  if (body) {
    const u = body.userData, b = calm ? 0 : Math.sin(now / 900);
    body.rotation.y = turn;
    if (u.rig) u.rig.update(calm ? 0 : dt, { pitch: -0.12 + b * 0.012, headYaw: calm ? 0 : Math.sin(now / 2300) * 0.07 });
    else {
      u.torso.scale.y = 1 + b * 0.004; u.aim.rotation.x = -0.12 + b * 0.012; u.head.rotation.y = calm ? 0 : Math.sin(now / 2300) * 0.07;
      u.legs[0].rotation.x = 0.1; u.legs[1].rotation.x = -0.12; u.legs[1].userData.knee.rotation.x = -0.06;
    }
  }
  R.render(scene, cam);
}
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (drag == null) return; turn = turnTo += (e.clientX - drag) * 0.01; drag = e.clientX; });
for (const t of ['pointerup', 'pointercancel']) canvas.addEventListener(t, () => { drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = clamp(zoom * (1 + Math.sign(e.deltaY) * 0.08), 0.5, 1.5); }, { passive: false });
canvas.tabIndex = 0;
canvas.addEventListener('keydown', e => { const d = { ArrowLeft: -0.25, ArrowRight: 0.25 }[e.key]; if (d) { turnTo += d; e.preventDefault(); } });

/* ---- cards ---- */
let batch = 0;
function picture(s, id, cv) {
  if (s === 'lo' || s === 'sa') { const m = buildGun(id, kit().gear.finish).g; snap(cv, m, { box: true }); dispose(m); return; }
  if (s === 'eq') { const m = buildEquip(id); m.rotation.y = 1.1; snap(cv, m, { box: true }); dispose(m); return; }
  if (s === 'finish') { const m = buildGun(kit().lo, id).g; snap(cv, m, { box: true }); dispose(m); return; }
  const m = makeSoldier(team, { ...kit().gear, [s]: id }, kit().lo);
  snap(cv, m, { view: GEAR[s].view });
  disposeSoldier(m);
}
function stats(W) {
  const far = damageAt(W, 60, false) / W.dmg, box = el('dl', 'stats');
  for (const [label, v, text] of [
    ['Damage', W.dmg * (W.pellets || 1) / 100, W.pellets ? `${W.dmg} × ${W.pellets}` : W.dmg], ['Fire rate', 60 / W.rate / 950, Math.round(60 / W.rate) + '/min'],
    ['Magazine', W.mag / 80, W.mag], ['Range', far, far > 0.95 ? 'Long' : far > 0.7 ? 'Medium' : 'Short'],
  ]) {
    const bar = el('span', 'bar'), i = el('i'), dd = el('dd', '', text);
    i.style.width = Math.round(Math.min(1, v) * 100) + '%'; bar.append(i); dd.append(bar);
    box.append(el('dt', '', label), dd);
  }
  return box;
}
function paintItems() {
  const run = ++batch, L = LOAD[slot], ids = L ? L.ids : itemsOf(slot), jobs = [];
  $('slotName').textContent = slotName(slot);
  $('slotNote').textContent = L ? L.note : slot === 'camo' ? 'Arm bands, headgear band and back patch always show your team colour.' : 'Looks only. Gear does not change health, speed or hit areas.';
  $('items').className = 'items' + (slot === 'lo' || slot === 'sa' || slot === 'finish' ? ' wide' : '');
  $('items').replaceChildren(...ids.map(id => {
    const b = el('button', 'item'), cv = el('canvas'), on = current(slot) === id, o = L?.of(id);
    b.type = 'button'; b.dataset.id = id; b.setAttribute('aria-pressed', on);
    const wide = slot === 'lo' || slot === 'sa' || slot === 'finish';
    cv.width = wide ? 360 : 220; cv.height = wide ? 130 : 220; cv.ariaHidden = 'true';
    b.append(cv, el('b', '', itemName(slot, id)));
    if (o?.desc) b.append(el('small', '', o.desc));
    if (o?.dmg && o.mag) b.append(stats(o));
    if (o?.product) b.append(el('i', 'lock', locked(o.product) ? 'Locked online' : 'Owned'));
    b.onclick = () => pick(id);
    jobs.push([id, cv]);
    return b;
  }));
  // one picture per frame keeps the page smooth
  const next = () => { if (run !== batch || !jobs.length) return; const [id, cv] = jobs.shift(); picture(slot, id, cv); requestAnimationFrame(next); };
  requestAnimationFrame(next);
}
function paintSlots() {
  $('slots').replaceChildren(...GROUPS.map(([g, list]) => {
    const box = el('div'); box.append(el('h2', '', g));
    for (const s of list) {
      const b = el('button'); b.type = 'button'; b.dataset.slot = s;
      if (s === slot) b.setAttribute('aria-current', 'true');
      b.append(el('b', '', slotName(s)), el('small', '', itemName(s, current(s))));
      b.onclick = () => open(s);
      box.append(b);
    }
    return box;
  }));
}
function paintKits() {
  $('kits').replaceChildren(...profile.kits.map((k, i) => {
    const b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', i === profile.active);
    b.append(el('b', '', 'Kit ' + (i + 1)), el('small', '', WEAPONS[k.lo].name));
    b.onclick = () => { profile.active = i; saveProfile(profile); all(); };
    return b;
  }));
}
function paintBar() {
  for (const b of $('teamSeg').children) b.setAttribute('aria-pressed', b.dataset.team === team);
  $('swap').textContent = sidearm ? 'Show primary' : 'Show sidearm';
}
function note() {
  const no = [kit().lo, kit().sa].map(id => WEAPONS[id]).find(w => locked(w.product));
  $('status').textContent = '';
  if (!no) return;
  const a = el('a', '', 'Open the Store'); a.href = 'store.html';
  $('status').append(`${no.name} works in Practice. Online it has to be bought first. `, a);
}
function all() { dress(); paintKits(); paintSlots(); paintItems(); paintBar(); note(); }
function open(s) {
  slot = s; sidearm = s === 'sa' || (s !== 'lo' && s !== 'finish' && sidearm);
  look((LOAD[s] || GEAR[s]).view); dress(); paintSlots(); paintItems(); paintBar();
}
function pick(id) {
  const k = kit();
  if (LOAD[slot]) k[slot] = id; else k.gear = cleanGear({ ...k.gear, [slot]: id });
  saveProfile(profile);
  dress(); paintKits(); paintSlots(); note();
  for (const b of $('items').children) b.setAttribute('aria-pressed', b.dataset.id === id);
}

$('teamSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; team = b.dataset.team; dress(); paintItems(); paintBar(); };
$('swap').onclick = () => { sidearm = !sidearm; dress(); paintBar(); };
$('dice').onclick = () => { kit().gear = randomGear(); saveProfile(profile); look('full'); all(); };
$('nameIn').value = loadName();
saveName($('nameIn').value);
$('nameIn').oninput = () => saveName(cleanName($('nameIn').value));
$('nameIn').onblur = () => { $('nameIn').value = cleanName($('nameIn').value); };
{
  const r = loadRecord(), kd = r.deaths ? (r.kills / r.deaths).toFixed(2) : r.kills ? r.kills.toFixed(2) : '0';
  for (const [k, v] of [['Matches', r.matches], ['Wins', r.wins], ['Kills', r.kills], ['Headshots', r.heads], ['K/D', kd]]) $('record').append(el('dt', '', k), el('dd', '', v));
  $('record').title = 'Your online matches on this device';
}
await soldierReady;   // the rigged soldier, or the block one if it cannot load
all();
requestAnimationFrame(frame);
if (configured && maybeSignedIn()) ownedProducts().then(s => { owned = s; paintItems(); note(); }, () => {});
addEventListener('pageshow', e => { if (e.persisted) { profile = loadProfile(); all(); } });
