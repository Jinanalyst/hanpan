// Draws a city made by tools/osm/build.mjs from its footprints.
// Rectangular buildings are one instanced unit box per cell. Other shapes are extruded and merged per cell, with two simpler versions for
// the distance. Nothing here needs the network except loading the city's own file.
import * as THREE from 'three';
import { ring, area, fitBox, isBox, simplify } from './shared/osmgeo.js';
import { facadeTexture, BAY } from './osmtex.js';
import { buildStreets } from './osmstreet.js';
import { buildShops } from './osmshop.js';

const CELL = 200;                                   // metres; bigger cells mean fewer draw calls, smaller ones skip more of what is out of view
const LOD = [230, 400];                             // distance to a cell's centre where the simpler shapes start
const SIMPLE = 1.5;                                 // metres a middle-distance outline may differ from the real one
const BOXY = 0.75;                                  // a shape that fills this much of its tightest box looks like one from far away

export async function loadCity(id) {
  const r = await fetch(`maps/${encodeURIComponent(id)}.json`);
  if (!r.ok) throw new Error('No such city: ' + id);
  return r.json();
}

/* ---- facades ---- */
// aFac = facade number, floors, random offset, 1 when the lowest floor stands on the ground. One material draws every building.
function facadeMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = s => {
    s.uniforms.uTex = { value: facadeTexture() };
    s.uniforms.uBay = { value: BAY };
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aFac;
      #ifdef USE_INSTANCING
        attribute vec2 aDim;
      #endif
      uniform float uBay[4];
      varying vec2 vAt;
      varying float vShade;
      flat varying vec4 vFac;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vFac = aFac;
      vec3 face = normal;
      vec4 here = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        float along = abs(normal.x) > 0.5 ? aDim.y : aDim.x;
        vAt = vec2(uv.x * max(1.0, floor(along / uBay[int(aFac.x + 0.5)] + 0.5)), position.y * aFac.y);
        here = instanceMatrix * here;
        face = normalize(mat3(instanceMatrix) * (normal / vec3(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz), dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz))));
      #else
        vAt = uv;
      #endif
      vShade = normal.y > 0.5 ? 1.0 : 0.88 + 0.2 * dot(face.xz, vec2(0.45, 0.89)) + 0.14 * abs(face.x);   // the sky is not equally bright everywhere, so corners stay visible
      if (normal.y > 0.5) { vFac.x = -1.0; vAt = (modelMatrix * here).xz / 14.0; }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2DArray uTex;
      varying vec2 vAt;
      varying float vShade;
      flat varying vec4 vFac;`)
      .replace('#include <map_fragment>', `vec3 pic;
      if (vFac.x < -0.5) {   // roof: plain panels with seams that fade out in the distance
        float w = fwidth(vAt.x * 4.0);
        pic = vec3(0.225, 0.24, 0.245) * (1.0 - 0.3 * (1.0 - smoothstep(0.02, 0.02 + w, abs(fract(vAt.x * 4.0) - 0.5))) * clamp(0.12 / max(w, 0.001), 0.0, 1.0));
      }
      else {   // one look-up for both kinds of floor: explicit gradients are slow on laptop graphics
        bool low = vFac.w > 0.5 && vAt.y < 1.0;
        pic = texture(uTex, vec3((vAt.x + vFac.z) * 0.25, low ? vAt.y : (vAt.y + floor(vFac.z * 0.5)) * 0.25, vFac.x + (low ? 4.0 : 0.0))).rgb;
      }
      diffuseColor.rgb *= pic * vShade;`);
  };
  return m;
}

/* ---- meshes ---- */
const bin = () => ({ p: [], n: [], c: [], uv: [], f: [], ix: [] });
// Walls and roof of an outline (wound so area > 0) between heights y0 and y1, relative to (ox, oz).
// uv counts bays along a wall and floors up it.
function extrude(out, outer, holes, { y0, y1, col, fac }, ox, oz) {
  const vert = (x, y, z, nx, ny, nz, u = 0, v = 0) => {
    out.p.push(x - ox, y, z - oz); out.n.push(nx, ny, nz); out.c.push(col.r, col.g, col.b); out.uv.push(u, v); out.f.push(...fac);
  };
  const bay = BAY[fac[0]], floors = fac[1];
  const wall = (p, sign) => {
    for (let j = p.length - 1, i = 0; i < p.length; j = i++) {
      const [a, b] = sign > 0 ? [p[j], p[i]] : [p[i], p[j]], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      if (l < 1e-4) continue;
      const k = out.p.length / 3, nx = dz / l, nz = -dx / l, u = l < bay * 0.4 ? 0 : Math.max(1, Math.round(l / bay));   // too narrow for a window: plain
      vert(a[0], y0, a[1], nx, 0, nz); vert(a[0], y1, a[1], nx, 0, nz, 0, floors); vert(b[0], y0, b[1], nx, 0, nz, u); vert(b[0], y1, b[1], nx, 0, nz, u, floors);
      out.ix.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  };
  wall(outer, 1);
  for (const h of holes) wall(h, -1);
  const V2 = r => r.map(([x, z]) => new THREE.Vector2(x, z)), all = [...outer, ...holes.flat()], k = out.p.length / 3;
  for (const [x, z] of all) vert(x, y1, z, 0, 1, 0);
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(V2(outer), holes.map(V2))) {
    const A = all[a], B = all[b], C = all[c], up = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]) > 0;
    out.ix.push(k + a, k + (up ? b : c), k + (up ? c : b));
  }
}
function meshOf(b, mat) {
  const g = new THREE.BufferGeometry(), set = (name, list, n) => g.setAttribute(name, new THREE.Float32BufferAttribute(list, n));
  set('position', b.p, 3); set('normal', b.n, 3); set('color', b.c, 3); set('uv', b.uv, 2); set('aFac', b.f, 4);
  g.setIndex(b.ix);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
function boxes(list, unit, mat, ox, oz) {
  const geo = unit.clone(), m = new THREE.InstancedMesh(geo, mat, list.length), dim = new Float32Array(list.length * 2), facs = new Float32Array(list.length * 4);
  list.forEach(({ f, y0, y1, col, fac }, i) => {
    M4.compose(new THREE.Vector3(f.x - ox, y0, f.z - oz), Q.setFromAxisAngle(UP, -f.a), new THREE.Vector3(f.w, y1 - y0, f.d));
    m.setMatrixAt(i, M4); m.setColorAt(i, col);
    dim[i * 2] = f.w; dim[i * 2 + 1] = f.d; facs.set(fac, i * 4);
  });
  geo.setAttribute('aDim', new THREE.InstancedBufferAttribute(dim, 2));
  geo.setAttribute('aFac', new THREE.InstancedBufferAttribute(facs, 4));
  m.castShadow = m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}
function unitBox() {   // standing on y = 0, no bottom face
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  g.setIndex([...g.index.array].filter((_, i) => (i / 6 | 0) !== 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

/* ---- the whole city ---- */
const GLASS = [[0.72, 0.84, 0.96], [0.62, 0.78, 0.86], [0.9, 0.93, 0.96], [0.86, 0.76, 0.64], [0.66, 0.8, 0.76], [0.52, 0.6, 0.7]];   // office glass colours
const PAINT = [[1.02, 1, 0.97], [0.94, 0.95, 0.98], [1.04, 0.96, 0.88], [0.82, 0.83, 0.86], [0.96, 0.9, 0.84]];                         // other walls
// showGuess paints buildings whose height is only the default value. plain draws grey boxes and nothing else.
export function buildCity(data, { showGuess = false, plain = false } = {}) {
  const group = new THREE.Group(), U = data.unit, cells = new Map();
  const mat = plain ? new THREE.MeshLambertMaterial({ vertexColors: true }) : facadeMaterial(), box = unitBox();
  const stats = { buildings: data.buildings.length, instanced: 0, extruded: 0, cells: 0 };
  data.buildings.forEach((b, i) => {
    const p = ring(b.p, U), f = fitBox(p), holes = (b.o || []).map(h => ring(h, U));
    const pal = plain ? [[1, 1, 1.02]] : b.f ? PAINT : GLASS, t = pal[i * 13 % pal.length], k = (plain ? 0.5 : 0.9) + (i * 7919 % 100) / 100 * 0.14;
    const col = showGuess && b.g ? new THREE.Color(0.95, 0.45, 0.16) : new THREE.Color(t[0] * k, t[1] * k, t[2] * k);
    const square = !holes.length && isBox(p, f), fill = area(p) / (f.w * f.d);
    f.w += (i % 5) * 0.05; f.d += (i % 5) * 0.05;   // walls of overlapping buildings also keep apart
    const y0 = (b.b || 0) * U, y1 = b.h * U + (i % 8) * 0.015;   // a hair apart, so overlapping roofs do not flicker
    const q = { p, f, holes, col, y0, y1, fill, fac: [b.f, b.n, i * 7 % 16, b.b ? 0 : 1] };
    const cx = Math.floor(f.x / CELL), cz = Math.floor(f.z / CELL), key = cx + ',' + cz;
    let c = cells.get(key);
    if (!c) cells.set(key, c = { x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL, rect: [], free: [] });
    (square ? c.rect : c.free).push(q);
  });
  for (const c of cells.values()) {
    stats.cells++; stats.instanced += c.rect.length; stats.extruded += c.free.length;
    if (c.rect.length) { const m = boxes(c.rect, box, mat, c.x, c.z); m.position.set(c.x, 0, c.z); group.add(m); }
    if (!c.free.length) continue;
    const near = bin(), mid = bin(), rest = bin(), far = new THREE.Group(), boxy = [];
    for (const q of c.free) {
      const s = simplify(q.p, SIMPLE);
      extrude(near, q.p, q.holes, q, c.x, c.z);
      extrude(mid, s, [], q, c.x, c.z);
      if (q.fill > BOXY) boxy.push(q); else extrude(rest, s, [], q, c.x, c.z);
    }
    if (boxy.length) far.add(boxes(boxy, box, mat, c.x, c.z));
    if (rest.ix.length) far.add(meshOf(rest, mat));
    const lod = new THREE.LOD();
    lod.position.set(c.x, 0, c.z);
    lod.addLevel(meshOf(near, mat), 0);
    lod.addLevel(meshOf(mid, mat), LOD[0], 0.08);
    lod.addLevel(far, LOD[1], 0.08);
    group.add(lod);
  }
  if (!plain) {
    const streets = buildStreets(data), shops = buildShops(data);
    group.add(streets.group, shops.group);
    Object.assign(stats, streets.stats, shops.stats);
  }
  group.updateMatrixWorld(true);
  const dispose = () => {
    group.traverse(o => {
      if (o.isInstancedMesh) o.dispose();
      if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); }
    });
    box.dispose();
  };
  return { group, stats, dispose };
}

// Where the main street passes closest to the middle, and which way it runs.
export function mainStreet(data) {
  let best = null;
  for (const rank of [['motorway', 'trunk', 'primary'], ['secondary', 'tertiary'], ['residential', 'unclassified', 'living_street', 'pedestrian']]) {
    for (const r of data.roads) {
      if (!rank.includes(r.k) || r.y) continue;
      const p = ring(r.p, data.unit);
      for (let i = 1; i < p.length; i++) {
        const [a, b] = [p[i - 1], p[i]], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
        const k = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dz) / l2)), x = a[0] + dx * k, z = a[1] + dz * k, d = Math.hypot(x, z);
        if (!best || d < best.d) best = { d, x, z, dx: dx / Math.sqrt(l2), dz: dz / Math.sqrt(l2) };
      }
    }
    if (best) return best;
  }
  return { x: 0, z: 0, dx: 0, dz: 1 };
}

// The credit OpenStreetMap asks for. Any page that shows a city must show this.
export function attribution(data) {
  const a = document.createElement('a');
  a.className = 'osm'; a.href = data.source.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = data.source.attribution;
  return a;
}
