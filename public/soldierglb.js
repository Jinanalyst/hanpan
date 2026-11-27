// The rigged soldier: one GLB loaded once, cloned per player with its own skeleton and AnimationMixer.
// Gear from soldier.js (helmet, face gear, vest, pack, team marks) is hung on the bones, and the arms
// reach for the gun with a small two-bone IK, so every kit still works on the new body.
// Add ?legacy=1 to the page address to keep the old block soldiers; a failed load does the same.
// ?model=swat shows the earlier Quaternius body instead of the default one.
import * as THREE from 'three';

const url = f => new URL('./models/' + f, import.meta.url).href;
export const MODELS = {
  // Custom soldier made with Meshy 6 through Higgsfield (text to 3D, auto-rig, library clips); see docs/glb-soldier.
  meshy: {
    url: url('soldier-v2.glb'),
    bones: {
      body: 'Hips', abdomen: 'Spine02', torso: 'Spine01', chest: 'Spine', neck: 'neck', head: 'Head',
      upperArmL: 'LeftArm', lowerArmL: 'LeftForeArm', wristL: 'LeftHand',
      upperArmR: 'RightArm', lowerArmR: 'RightForeArm', wristR: 'RightHand',
      upperLegL: 'LeftUpLeg', lowerLegL: 'LeftLeg', footL: 'LeftFoot',
      upperLegR: 'RightUpLeg', lowerLegR: 'RightLeg', footR: 'RightFoot',
    },
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', death: 'Death', crouch: 'Crouch' },
    chained: true,                 // the feet hang under the shins
    recolor: 'key',                // one textured mesh: uniform, skin and the shoulder patch are told apart by colour
    head: 'model',                 // the model's own face and hair stay; headgear goes over them
    walkSpeed: 1.5, runSpeed: 4.2, crouchSpeed: 1.1,
    // head: measured from the vertices on the head bone (0.25 m tall, its centre 9 cm in front of the bone)
    fit: { head: { x: 0.01, y: -0.011, z: -0.092, s: 1.08 }, torso: { y: 0.95, z: 0.0, s: [0.95, 0.95, 0.95] }, aim: { y: 1.38 } },
  },
  // "SWAT" by Quaternius (CC0). three.js drops the dots from Blender bone names ("UpperArm.L" -> "UpperArmL").
  swat: {
    url: url('soldier.glb'),
    bones: {
      body: 'Body', abdomen: 'Abdomen', torso: 'Torso', chest: 'Chest', neck: 'Neck', head: 'Head',
      upperArmL: 'UpperArmL', lowerArmL: 'LowerArmL', wristL: 'WristL', handL: 'Middle1L',
      upperArmR: 'UpperArmR', lowerArmR: 'LowerArmR', wristR: 'WristR', handR: 'Middle1R',
      upperLegL: 'UpperLegL', lowerLegL: 'LowerLegL', footL: 'FootL',
      upperLegR: 'UpperLegR', lowerLegR: 'LowerLegR', footR: 'FootR',
    },
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', death: 'Death' },
    hide: /^Swat_Head/,            // the built-in helmet; our own head and headgear replace it
    recolor: 'roles',
    role: { Swat_Feet: 'boot', Swat: 'cloth', Swat_Black: 'dark', Skin: 'glove', Visor: 'dark' },   // mesh name first, then material name
    head: 'gear',
    walkSpeed: 1.7, runSpeed: 4.6,   // metres per second each clip covers at time scale 1
    fit: { head: { y: -0.035, z: 0.01, s: 1.22 }, torso: { y: 0.93, z: 0, s: [1, 0.98, 1.05] }, aim: { y: 1.4 } },
  },
};
const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
export const MODEL = MODELS[query.get('model')] || MODELS.meshy;

let base = null;
const legacy = query.get('legacy') === '1';

async function load() {
  if (legacy) return false;
  try {
    const [{ GLTFLoader }, SkeletonUtils] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
    const gltf = await new GLTFLoader().loadAsync(MODEL.url);
    const clips = {};
    for (const [k, name] of Object.entries(MODEL.clips)) {
      clips[k] = gltf.animations.find(a => a.name === name || a.name.split('|').includes(name));
      if (!clips[k]) throw new Error('clip ' + name + ' is missing');
    }
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.userData.shared = true;   // clones share it; only the template owns it
      o.userData.role = MODEL.role?.[o.name] || MODEL.role?.[o.material.name] || 'cloth';
    });
    for (const b of Object.values(MODEL.bones)) if (!gltf.scene.getObjectByName(b)) throw new Error('bone ' + b + ' is missing');
    base = { scene: gltf.scene, clips, clone: SkeletonUtils.clone };
    return true;
  } catch (e) {
    console.warn('[soldier] using the block soldier:', e.message || e);
    return false;
  }
}
// Resolves true once the rigged soldier can be made, false when the block soldier stays.
export const soldierReady = load();
export const hasRig = () => !!base;

// A copy of the model's textured material that repaints the uniform, the skin and the orange shoulder patch,
// keeping the texture's shading. One shader for every soldier; the colours are per material.
const keyed = new Map();
export function keyedMaterial(src, cloth, skin, band) {
  const k = `${src.uuid}:${cloth}:${skin}:${band}`;
  let m = keyed.get(k);
  if (m) return m;
  m = src.clone(); m.userData.shared = true;
  const u = { uCloth: { value: new THREE.Color(cloth) }, uSkin: { value: new THREE.Color(skin) }, uBand: { value: new THREE.Color(band) } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform vec3 uCloth, uSkin, uBand;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      {
        vec3 c = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));   // judge colours in display space
        float hi = max(c.r, max(c.g, c.b)), lo = min(c.r, min(c.g, c.b)), sat = hi > 0.0 ? (hi - lo) / hi : 0.0, lum = dot(c, vec3(0.299, 0.587, 0.114));
        float warm = c.r - c.g, rb = c.b / max(c.r, 0.001);
        float isBand = step(0.55, sat) * step(0.12, warm) * step(rb, 0.3) * step(0.45, hi);      // the bright orange patch
        float isSkin = (1.0 - isBand) * step(0.06, warm) * step(0.42, rb) * step(0.18, sat) * step(0.25, lum);
        float isCloth = (1.0 - isBand) * (1.0 - isSkin) * step(0.3, lum) * step(sat, 0.4);       // the khaki uniform
        vec3 shade = vec3(lum), g = vec3(1.0 / 2.2);   // the colour uniforms arrive linear
        vec3 col = mix(c, pow(uCloth, g) * (shade / 0.56), isCloth);
        col = mix(col, pow(uSkin, g) * (shade / 0.62), isSkin);
        col = mix(col, pow(uBand, g), isBand);
        diffuseColor.rgb = pow(clamp(col, 0.0, 1.0), vec3(2.2));
      }`);
  };
  m.customProgramCacheKey = () => 'hanpan-keyed-soldier';
  keyed.set(k, m);
  return m;
}

const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _t = V(), _u = V(), _v = V(), _w = V(), _q = Q(), _q2 = Q(), _q3 = Q(), _gq = Q(), _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Turns a bone in world space by quaternion q (world), keeping its children attached.
function turnWorld(bone, q) {
  bone.getWorldQuaternion(_q2).premultiply(q);
  bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(_q2));
  bone.updateMatrixWorld(true);
}
function aimBone(bone, from, to) { _q.setFromUnitVectors(from, to); turnWorld(bone, _q); }
// Two-bone IK: bends a -> b so the point `end` (in b's space) reaches world point T, bending toward world `pole`.
function ik2(a, b, end, T, pole) {
  a.getWorldPosition(_a); b.getWorldPosition(_b); _c.copy(end).applyMatrix4(b.matrixWorld);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  _u.subVectors(T, _a); const d = clamp(_u.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3); _u.normalize();
  _v.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_v.lengthSq() < 1e-8) return; _v.normalize();
  const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
  _w.copy(_u).multiplyScalar(ca).addScaledVector(_v, sa);   // where the elbow / knee should point
  aimBone(a, _t.subVectors(_b, _a).normalize(), _w);
  b.getWorldPosition(_b); _c.copy(end).applyMatrix4(b.matrixWorld);
  _w.copy(_a).addScaledVector(_u, d).sub(_b).normalize();
  aimBone(b, _t.subVectors(_c, _b).normalize(), _w);
}

// A dressed, animated body. `g` is the soldier group (feet at y 0, looking to -z), as with the block soldier.
export function makeRig(g) {
  const root = base.clone(base.scene);
  root.rotation.y = Math.PI;   // the models look to +z
  g.add(root);
  const B = {}, rest = new Map();
  for (const [k, n] of Object.entries(MODEL.bones)) { B[k] = root.getObjectByName(n); rest.set(B[k], [B[k].position.clone(), B[k].quaternion.clone()]); }
  const meshes = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    if (MODEL.hide?.test(o.name)) o.visible = false; else meshes.push(o);
  });
  const mixer = new THREE.AnimationMixer(root), act = {}, steps = ['walk', 'run', 'crouch'].filter(n => base.clips[n]);
  for (const [k, clip] of Object.entries(base.clips)) { act[k] = mixer.clipAction(clip); act[k].play(); act[k].setEffectiveWeight(k === 'idle' ? 1 : 0); }
  for (const n of steps) act[n].timeScale = 0;   // their time is driven by one shared step phase
  act.death.setLoop(THREE.LoopOnce, 1); act.death.clampWhenFinished = true; act.death.timeScale = 0;
  const w = Object.fromEntries(Object.keys(act).map(n => [n, n === 'idle' ? 1 : 0]));
  let phase = 0, dying = -1, crouch = 0;
  // where the end of each shin sits, measured once in the standing pose
  mixer.update(0); g.updateMatrixWorld(true);
  for (const [b, [pos, q]] of rest) { pos.copy(b.position); q.copy(b.quaternion); }
  const footEnd = [B.lowerLegL, B.lowerLegR].map((l, i) => l.worldToLocal((i ? B.footR : B.footL).getWorldPosition(V())));
  const aimPt = { r: null, l: null };   // hand grips in the aim group's space (set by setWeapon)

  const P = { speed: 0, back: false, cr: 0, pr: 0, pitch: 0, rear: 0, side: 0, low: 0, wallFoot: 0, dead: false, headYaw: 0 };
  const inG = (x, y, z, out) => out.set(x, y, z).applyQuaternion(_gq);           // g-space direction -> world
  const ptG = (x, y, z, out) => g.localToWorld(out.set(x, y, z));                 // g-space point -> world
  function spin(bone, axis, angle) { if (!angle) return; inG(axis.x, axis.y, axis.z, _t); _q.setFromAxisAngle(_t, angle); turnWorld(bone, _q); }
  const dur = n => base.clips[n].duration;

  function update(dt, p = {}) {
    const s = Object.assign({}, P, p), k = Math.min(1, dt * 10);
    // undo last frame's IK: back to what the mixer last wrote (it only writes values that change)
    for (const [b, [pos, q]] of rest) { b.position.copy(pos); b.quaternion.copy(q); }
    // clip weights: idle -> walk -> run by speed, a crouch clip when there is one, death on its own
    const tw = Object.fromEntries(Object.keys(w).map(n => [n, 0]));
    if (s.dead) {
      if (dying < 0) { dying = 0; act.death.reset().play(); act.death.timeScale = 0; }
      tw.death = 1;
    } else {
      dying = -1;
      const v = s.speed * (s.cr === 2 ? 1.4 : s.cr ? 1.1 : 1);
      let rate;
      if (s.cr === 1 && act.crouch) { tw.crouch = 1; rate = clamp(v / MODEL.crouchSpeed, 0, 1.6) / dur('crouch'); }
      else {
        const wi = clamp(1 - v / 1.1, 0, 1), wr = s.cr ? 0 : clamp((v - 2.4) / 1.8, 0, 1);
        tw.idle = wi; tw.walk = Math.max(0, 1 - wi - wr); tw.run = wr;
        const mv = tw.walk + tw.run || 1;
        rate = (tw.walk * clamp(v / MODEL.walkSpeed, 0.55, 1.8) / dur('walk') + tw.run * clamp(v / MODEL.runSpeed, 0.7, 1.6) / dur('run')) / mv;
      }
      phase = (phase + dt * rate * (s.back ? -1 : 1) + 1) % 1;
    }
    for (const n in w) { w[n] += (tw[n] - w[n]) * (dt ? k : 1); act[n].setEffectiveWeight(w[n]); }
    for (const n of steps) act[n].time = phase * dur(n);
    if (dying >= 0) { dying = Math.min(dur('death'), dying + dt); act.death.time = dying; }
    mixer.update(0);
    for (const [b, [pos, q]] of rest) { pos.copy(b.position); q.copy(b.quaternion); }
    g.getWorldQuaternion(_gq);
    g.updateMatrixWorld(true);
    const aim = g.userData.aim;
    aim.visible = !s.dead;
    if (s.dead) return;   // the death clip plays as made, with the gun put away

    // kneel (when the model has no crouch clip): hips down, one foot forward, the other knee on the ground
    crouch += ((s.cr === 1 && !act.crouch ? 1 : 0) - crouch) * (dt ? Math.min(1, dt * 9) : 1);
    const drop = 0.36 * crouch + 0.15 * s.low, still = 1 - Math.min(1, s.speed / 1.2);
    if (drop > 0.001 || s.wallFoot > 0.001) {
      const feet = [B.footL, B.footR].map(f => g.worldToLocal(f.getWorldPosition(V())));   // before the hips move
      B.body.getWorldPosition(_b); g.worldToLocal(_b); _b.y -= drop; g.localToWorld(_b);
      B.body.parent.worldToLocal(_b); B.body.position.copy(_b); B.body.updateMatrixWorld(true);
      const kneel = crouch * still;
      for (const [i, up, lo, ft] of [[0, B.upperLegL, B.lowerLegL, B.footL], [1, B.upperLegR, B.lowerLegR, B.footR]]) {
        let { x: fx, y: fy, z: fz } = feet[i], pitchFoot = 0;
        if (kneel > 0) {
          const [kx, ky, kz] = i ? [0.13, 0.13, 0.36] : [-0.13, fy, -0.3];   // right knee down, left foot planted ahead
          fx += (kx - fx) * kneel; fy += (ky - fy) * kneel; fz += (kz - fz) * kneel;
          if (i) pitchFoot = 1.1 * kneel;
        }
        if (!i && s.wallFoot > 0) { fy += 0.32 * s.wallFoot; fz += 0.12 * s.wallFoot; pitchFoot = -0.5 * s.wallFoot; }
        const T = ptG(fx, fy, fz, V());
        if (!MODEL.chained) {   // separate foot bones go to the target themselves
          ft.parent.worldToLocal(_c.copy(T)); ft.position.copy(_c); ft.updateMatrixWorld(true);
          if (pitchFoot) spin(ft, X, pitchFoot);
        }
        ik2(up, lo, footEnd[i], T, inG(i ? 0.05 : -0.05, i ? -0.6 * kneel : 0, -1, V()));
      }
    }
    // upper body: lean on a wall, then look up and down through the spine and neck
    spin(B.abdomen, X, s.rear - 0.1 * crouch); spin(B.abdomen, Z, -s.side);
    const pitch = s.pitch * (1 - s.pr);
    spin(B.abdomen, X, pitch * 0.15); spin(B.torso, X, pitch * 0.2); spin(B.chest, X, pitch * 0.25);
    spin(B.neck, X, pitch * 0.2 - s.rear * 0.6 + s.pr * 1.15);
    if (s.headYaw) spin(B.head, Y, s.headYaw);
    // the gun points where the player looks, whatever the clip does with the chest; then the arms reach for it
    _e.set(s.pitch + s.pr * Math.PI / 2, 0, -s.side * 0.2);
    _q.setFromEuler(_e).premultiply(_gq);                     // wanted world turn of the gun
    aim.parent.getWorldQuaternion(_q3).invert();
    aim.quaternion.copy(_q3.multiply(_q));
    aim.updateMatrixWorld(true);
    if (!aimPt.r) return;
    for (const [up, lo, wr, hand, pt, sx] of [[B.upperArmR, B.lowerArmR, B.wristR, B.handR, aimPt.r, 1], [B.upperArmL, B.lowerArmL, B.wristL, B.handL, aimPt.l, -1]]) {
      const T = aim.localToWorld(_t.copy(pt));
      ik2(up, lo, wr.position, T.clone(), inG(sx * 0.7, -1, 0.35, V()));
      // fingers forward along the gun, a little down (no finger bones: the hand bone points along its +y)
      if (hand) { wr.getWorldPosition(_a); hand.getWorldPosition(_b); _b.sub(_a).normalize(); }
      else _b.copy(Y).applyQuaternion(wr.getWorldQuaternion(_q3));
      _c.set(sx * -0.15, sx > 0 ? -0.55 : -0.25, -1).normalize().transformDirection(aim.matrixWorld);
      aimBone(wr, _b.clone(), _c);
    }
  }
  function dispose() {
    mixer.stopAllAction(); mixer.uncacheRoot(root);
    root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
  }
  return { root, bones: B, meshes, mixer, update, dispose, aimPt };
}
