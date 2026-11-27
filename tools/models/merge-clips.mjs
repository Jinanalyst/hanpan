// Merges single-clip GLBs (one animation each, same rig) into one game-ready soldier GLB.
// Meshy/Higgsfield rigging returns one clip per job; this keeps the first file's mesh and skeleton
// and copies every other file's clip onto it by bone name, renaming the clips.
//
//   npm i --no-save @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp
//   node tools/models/merge-clips.mjs public/models/soldier.glb idle.glb:Idle walk.glb:Walk run.glb:Run death.glb:Death crouch.glb:Crouch
//
// Scale tracks are dropped (one clip can bake a different hip scale, which makes the body grow
// when that clip plays), the texture is shrunk to 1024 px, and vertices are quantized.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const [out, ...inputs] = process.argv.slice(2);
if (!out || !inputs.length) { console.error('usage: node tools/models/merge-clips.mjs <out.glb> <in.glb:ClipName>...'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const parse = s => { const i = s.lastIndexOf(':'); return i > 1 ? [s.slice(0, i), s.slice(i + 1)] : [s, null]; };

const [basePath, baseName] = parse(inputs[0]);
const doc = await io.read(basePath), root = doc.getRoot(), buf = root.listBuffers()[0];
const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
for (const a of root.listAnimations()) if (baseName) a.setName(baseName);

for (const spec of inputs.slice(1)) {
  const [file, name] = parse(spec);
  const src = await io.read(file);
  for (const a of src.getRoot().listAnimations()) {
    const anim = doc.createAnimation(name || a.getName());
    for (const ch of a.listChannels()) {
      const node = byName.get(ch.getTargetNode()?.getName()), s = ch.getSampler();
      if (!node) continue;
      const copy = acc => doc.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buf);
      const sam = doc.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
      anim.addSampler(sam).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(sam));
    }
  }
}
for (const a of root.listAnimations()) for (const ch of a.listChannels()) if (ch.getTargetPath() === 'scale') { const s = ch.getSampler(); ch.dispose(); s.dispose(); }

await doc.transform(
  dedup(), resample(), prune(),
  textureCompress({ encoder: sharp, resize: [1024, 1024] }),
  quantize({ quantizePosition: 14, quantizeNormal: 10 }),
);
await io.write(out, doc);
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
console.log(`${out}: ${tris} triangles, clips ${root.listAnimations().map(a => `${a.getName()} ${a.listChannels().length}ch`).join(', ')}`);
