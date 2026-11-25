// Ground-floor shops of a generated city: a window, a sign board and for some an awning. Three draw calls for all of them.
import * as THREE from 'three';
import { shopWindows, signSheet, shopColor, SIGN } from './osmtex.js';

export const SHOP_H = 3.2;                          // metres, window and sign together
const WIN_H = 2.45, SIGN_H = 0.75, WIN_D = 0.1, SIGN_D = 0.28;
const AWNING = new Set(['cafe', 'bakery', 'food', 'fashion']);

// One of the pictures of an array texture on the front, plain frame colour on the sides.
function windowMaterial(tex) {
  const m = new THREE.MeshLambertMaterial({ emissive: 0xffffff, emissiveIntensity: 0.22 });
  m.onBeforeCompile = s => {
    s.uniforms.uTex = { value: tex };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPic; varying vec3 vPic; varying float vFront;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPic = vec3(uv, aPic); vFront = normal.z;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2DArray uTex; varying vec3 vPic; varying float vFront;')
      .replace('#include <map_fragment>', 'vec3 pic = texture(uTex, vec3(vPic.xy, floor(vPic.z + 0.5))).rgb;\nif (vFront < 0.5) pic = vec3(0.06);\ndiffuseColor.rgb *= pic;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= pic;');
  };
  return m;
}
function signMaterial(sheet) {
  const m = new THREE.MeshLambertMaterial({ emissive: 0xffffff, emissiveIntensity: 0.4 });
  m.onBeforeCompile = s => {
    s.uniforms.uTex = { value: sheet.texture }; s.uniforms.uCell = { value: new THREE.Vector2(1 / SIGN.cols, 1 / sheet.rows) };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uCell; attribute vec2 aCell; varying vec2 vSign;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSign = vec2((aCell.x + (normal.z > 0.5 ? mix(0.01, 0.99, uv.x) : 0.02)) * uCell.x, 1.0 - (aCell.y + 1.0 - (normal.z > 0.5 ? mix(0.03, 0.97, uv.y) : 0.9)) * uCell.y);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uTex; varying vec2 vSign;')
      .replace('#include <map_fragment>', 'vec3 pic = texture2D(uTex, vSign).rgb;\ndiffuseColor.rgb *= pic;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= pic;');
  };
  return m;
}
// A box standing on y = 0 with its back on z = 0.
function slab() { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0.5); g.setIndex([...g.index.array].filter((_, i) => (i / 6 | 0) !== 5)); return g; }

export function buildShops(data) {
  const group = new THREE.Group(), U = data.unit, list = data.shops, kinds = data.shopKinds, n = list.length;
  if (!n) return { group, stats: { shops: 0 } };
  const sheet = signSheet(data.shopNames, kinds), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  const winG = slab(), signG = slab(), pic = new Float32Array(n), cell = new Float32Array(n * 2);
  const win = new THREE.InstancedMesh(winG, windowMaterial(shopWindows(kinds)), n), sign = new THREE.InstancedMesh(signG, signMaterial(sheet), n);
  const shade = list.map((s, i) => [s, i]).filter(([s, i]) => AWNING.has(kinds[s[4]]) && i % 3 !== 0);
  const awn = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 1).translate(0, 0, 0.5), new THREE.MeshLambertMaterial(), shade.length), col = new THREE.Color();
  list.forEach(([x, z, a, w, cat, name], i) => {
    Q.setFromAxisAngle(UP, a / 10 * Math.PI / 180); P.set(x * U, 0, z * U);
    win.setMatrixAt(i, M.compose(P, Q, S.set(w * U, WIN_H, WIN_D)));
    P.y = WIN_H;
    sign.setMatrixAt(i, M.compose(P, Q, S.set(w * U + 0.1, SIGN_H, SIGN_D)));
    pic[i] = cat; cell[i * 2] = name % SIGN.cols; cell[i * 2 + 1] = Math.floor(name / SIGN.cols);
  });
  shade.forEach(([[x, z, a, w, cat], i], k) => {
    Q.setFromAxisAngle(UP, a / 10 * Math.PI / 180); Q2.setFromAxisAngle(X, 0.42); P.set(x * U, WIN_H - 0.02, z * U);
    awn.setMatrixAt(k, M.compose(P, Q.multiply(Q2), S.set(w * U, 1, 1.15)));
    awn.setColorAt(k, col.set(i % 2 ? shopColor(kinds[cat]) : '#e9e2d2'));
  });
  winG.setAttribute('aPic', new THREE.InstancedBufferAttribute(pic, 1));
  signG.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
  for (const m of [win, sign, awn]) { m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
  awn.castShadow = true;
  return { group, stats: { shops: n, awnings: shade.length } };
}
