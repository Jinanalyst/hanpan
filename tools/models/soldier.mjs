// Shrinks a rigged character GLB for the game: keeps only the clips the soldier uses, drops the
// "Armature|" prefix from clip names, merges duplicates, resamples keyframes and quantizes vertices.
//
//   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions
//   node tools/models/soldier.mjs <in.glb> public/models/soldier.glb
//
// Source used now: "SWAT" by Quaternius (CC0 1.0), https://poly.pizza/m/Btfn3G5Xv4
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, weld } from '@gltf-transform/functions';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node tools/models/soldier.mjs <in.glb> <out.glb>'); process.exit(1); }
const KEEP = new Set(['Idle', 'Idle_Gun', 'Idle_Gun_Pointing', 'Walk', 'Run', 'Run_Shoot', 'Death', 'Gun_Shoot', 'HitRecieve']);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
for (const a of doc.getRoot().listAnimations()) {
  const name = a.getName().replace(/^.*\|/, '');
  if (KEEP.has(name)) a.setName(name); else a.dispose();
}
await doc.transform(weld(), dedup(), resample(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10 }));
await io.write(out, doc);
const root = doc.getRoot();
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
console.log(`${out}: ${tris} triangles, clips ${root.listAnimations().map(a => a.getName()).join(', ')}`);
