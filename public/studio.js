// Still pictures of soldiers and weapons for cards and the menu.
import * as THREE from 'three';

export function lightStage(scene) {
  scene.add(new THREE.HemisphereLight(0xf1f0e4, 0x5a5540, 1.5));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.set(-2.2, 3.4, -3);
  const rim = new THREE.DirectionalLight(0x9fc2ff, 1.8); rim.position.set(2.5, 2.2, 3);
  scene.add(key, rim);
  return key;
}
// Where the camera looks for each part of the body: [target y, distance, yaw turn of the soldier]
export const VIEWS = { full: [0.84, 4.1, 0.45], bust: [1.4, 1.85, 0.4], head: [1.62, 0.98, 0.4], chest: [1.28, 1.6, 0.45], back: [1.32, 1.75, 2.75], legs: [0.6, 2.0, 0.55], gun: [1.25, 2.0, 1.25] };

let R = null, scene, cam;
function ready() {
  if (R) return;
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene(); lightStage(scene);
  cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
}
// Draws the object into a 2D canvas.
export function snap(canvas, object, { view, box } = {}) {
  ready();
  const w = canvas.width, h = canvas.height;
  R.setSize(w, h, false);
  cam.aspect = w / h; cam.updateProjectionMatrix();
  scene.add(object);
  if (box) {   // fit the whole object, seen from its left side
    const b = new THREE.Box3().setFromObject(object), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    const d = Math.max(s.y, Math.max(s.z, 0.2) / cam.aspect) / 2 / Math.tan(cam.fov * Math.PI / 360) * 1.15;
    cam.position.set(c.x - d - s.x / 2, c.y + d * 0.12, c.z); cam.lookAt(c);
  } else {
    const [y, dist, turn] = VIEWS[view] || VIEWS.full;
    object.rotation.y = turn;
    cam.position.set(0, y + dist * 0.06, -dist * 1.05); cam.lookAt(0, y, 0);
  }
  R.render(scene, cam);
  scene.remove(object);
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h); g.drawImage(R.domElement, 0, 0, w, h);
}
// Frees the graphics memory when no more pictures are needed.
export function closeStudio() { if (R) { R.dispose(); R.forceContextLoss(); R = null; } }
