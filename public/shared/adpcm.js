// Voice packets: 16 kHz mono speech as 4-bit IMA ADPCM, about 8 KB/s per talking player.
// Client -> server: [seq u8][predictor i16 LE][index u8][320 bytes]. The server puts [player id u32 LE] in front.
// Every packet carries its own decoder state, so a lost packet only costs its own 40 ms.
export const RATE = 16000, FRAME = 640, HEAD = 4, PACKET = HEAD + FRAME / 2;

const STEPS = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
const NEXT = [-1, -1, -1, -1, 2, 4, 6, 8];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Shared by both sides so they always agree.
function apply(s, code) {
  const step = STEPS[s.index];
  let d = step >> 3;
  if (code & 4) d += step;
  if (code & 2) d += step >> 1;
  if (code & 1) d += step >> 2;
  s.value = clamp(s.value + (code & 8 ? -d : d), -32768, 32767);
  s.index = clamp(s.index + NEXT[code & 7], 0, 88);
  return s.value;
}

// pcm: Int16Array(FRAME). state: { value, index, seq }, kept between frames.
export function encode(pcm, state) {
  const out = new Uint8Array(PACKET), view = new DataView(out.buffer);
  view.setUint8(0, state.seq = ((state.seq || 0) + 1) & 255);
  view.setInt16(1, state.value, true);
  view.setUint8(3, state.index);
  for (let i = 0; i < FRAME; i++) {
    let diff = pcm[i] - state.value, code = 0, step = STEPS[state.index];
    if (diff < 0) { code = 8; diff = -diff; }
    if (diff >= step) { code |= 4; diff -= step; }
    if (diff >= step >> 1) { code |= 2; diff -= step >> 1; }
    if (diff >= step >> 2) code |= 1;
    apply(state, code);
    out[HEAD + (i >> 1)] |= code << (i & 1 ? 4 : 0);
  }
  return out;
}

// packet: Uint8Array(PACKET) -> Float32Array(FRAME)
export function decode(packet) {
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const s = { value: view.getInt16(1, true), index: Math.min(88, view.getUint8(3)) }, out = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) out[i] = apply(s, (packet[HEAD + (i >> 1)] >> (i & 1 ? 4 : 0)) & 15) / 32768;
  return out;
}
